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
  // A LINE diff, not a positional compare: an insertion at the top of a
  // file shifts every following line, and comparing line i with line i
  // reported the WHOLE file as removed AND added (a 20-line file with one
  // new first line produced 41 diff lines). The undo/`/diff` preview became
  // unreadable and the model was told everything changed. A longest-common-
  // subsequence walk emits only the lines that really differ.
  for (const op of diffOps(la, lb)) {
    if (op.kind === 'same') continue
    out.push((op.kind === 'del' ? '-' : '+') + op.line)
  }
  return out.join(String.fromCharCode(10))
}

type DiffOp = { kind: 'same' | 'del' | 'add'; line: string }

/**
 * Longest-common-subsequence line diff (Hunt–Szymanski style table, O(n*m)
 * memory). Files here are a handful of lines (a single edit preview), so the
 * simple dynamic-programming table is fine and keeps the module dependency-
 * free. A change pair is emitted as `-old` then `+new`, like a real diff.
 */
function diffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
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
