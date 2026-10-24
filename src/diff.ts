import { theme } from './theme.js'

export function unifiedDiff(
  a: string,
  b: string,
  { label = '' }: { label?: string } = {},
): string {
  const la = a.split(String.fromCharCode(10))
  const lb = b.split(String.fromCharCode(10))
  const out: string[] = []
  if (label) out.push('... ' + label)
  // A LINE diff, not a positional compare: an insertion at the top shifts
  // every following line, and comparing line i with line i reported the WHOLE
  // file as removed AND added (a 20-line file with one new first line produced
  // 41 diff lines), which made the undo preview unreadable and told the model
  // that everything changed.
  for (const op of diffOps(la, lb)) {
    if (op.kind === 'same') continue
    out.push((op.kind === 'del' ? '-' : '+') + op.line)
  }
  return out.join(String.fromCharCode(10))
}

type DiffOp = { kind: 'same' | 'del' | 'add'; line: string }

/**
 * Longest-common-subsequence line diff (an O(n*m) dynamic-programming table,
 * which keeps the module dependency-free). A change pair is emitted as
 * `-old` then `+new`, like a real diff.
 */
function diffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
  // The table is O(n*m) CELLS: a 20 000-line file changed wholesale needs
  // ~400M cells (~3.2 GB) and the process died with an out-of-memory crash
  // (the callers diff arbitrary source files, not "a handful of lines").
  // Past a sane budget, fall back to a positional diff: it is less precise
  // (no LCS alignment) but bounded, and a diff of a huge file is a preview.
  const MAX_CELLS = 4_000_000
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    const ops: DiffOp[] = []
    const max = Math.max(n, m)
    for (let k = 0; k < max; k++) {
      if (k < n && k < m && a[k] === b[k]) continue
      if (k < n) ops.push({ kind: 'del', line: a[k] })
      if (k < m) ops.push({ kind: 'add', line: b[k] })
    }
    return ops
  }
  // lcs[i][j] = length of the LCS of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'same', line: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ kind: 'del', line: a[i] })
      i++
    } else {
      ops.push({ kind: 'add', line: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ kind: 'del', line: a[i++] })
  while (j < m) ops.push({ kind: 'add', line: b[j++] })
  return ops
}

export function colorDiff(diffText: string): string {
  return diffText
    .split(String.fromCharCode(10))
    .map((line: string) => {
      if (line.startsWith('+++') || line.startsWith('---'))
        return theme.bold(line)
      if (line.startsWith('+')) return theme.assistant(line)
      if (line.startsWith('-')) return theme.error(line)
      if (line.startsWith('...')) return theme.system(line)
      return line
    })
    .join(String.fromCharCode(10))
}

export default { unifiedDiff, colorDiff }
