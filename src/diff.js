export function unifiedDiff(
  oldText,
  newText,
  { context = 3, label = '' } = {},
) {
  const a = (oldText ?? '').split('\n')
  const b = (newText ?? '').split('\n')

  if (oldText === newText) return '(без изменений)'

  const ops = diffOps(a, b)
  const out = []
  if (label) out.push(`--- ${label}`)

  let i = 0
  while (i < ops.length) {
    const op = ops[i]

    if (op.type === 'same') {
      let j = i
      while (j < ops.length && ops[j].type === 'same') j++
      const blockLen = j - i

      if (i === 0 && j === ops.length) {
        i = j
        continue
      }

      if (i === 0) {
        const end = Math.min(j, i + context)
        for (let k = i; k < end; k++) out.push(' ' + ops[k].line)
        if (end < j) out.push('...')
      } else if (j === ops.length) {
        const start = Math.max(i, j - context)
        if (start > i) out.push('...')
        for (let k = start; k < j; k++) out.push(' ' + ops[k].line)
      } else {
        const start = Math.max(i, j - context)
        const end = Math.min(j, i + context)
        if (start > i) out.push('...')
        for (let k = start; k < end; k++) out.push(' ' + ops[k].line)
        if (end < j) out.push('...')
      }

      i = j
      continue
    }

    const blockStart = i
    let j = i
    while (j < ops.length && ops[j].type !== 'same') j++

    const preStart = Math.max(0, blockStart - context)
    if (preStart < blockStart) {
      if (preStart > 0) out.push('...')
      for (let k = preStart; k < blockStart; k++) {
        out.push(' ' + ops[k].line)
      }
    }

    for (let k = blockStart; k < j; k++) {
      const o = ops[k]
      out.push((o.type === 'del' ? '-' : '+') + o.line)
    }

    const postEnd = Math.min(ops.length, j + context)
    for (let k = j; k < postEnd; k++) {
      out.push(' ' + ops[k].line)
    }
    if (postEnd < ops.length) out.push('...')

    i = j
  }

  return out.join('\n')
}

export function colorDiff(diffText, chalk) {
  return diffText
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---'))
        return chalk.bold(line)
      if (line.startsWith('+')) return chalk.green(line)
      if (line.startsWith('-')) return chalk.red(line)
      if (line.startsWith('...')) return chalk.gray(line)
      return line
    })
    .join('\n')
}

function diffOps(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', line: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', line: a[i] })
      i++
    } else {
      ops.push({ type: 'add', line: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'del', line: a[i++] })
  while (j < m) ops.push({ type: 'add', line: b[j++] })

  return ops
}
