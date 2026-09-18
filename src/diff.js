import { theme } from './theme.js'

export function unifiedDiff(a, b, { label = '' } = {}) {
  const la = a.split(String.fromCharCode(10))
  const lb = b.split(String.fromCharCode(10))
  const n = Math.max(la.length, lb.length)
  const out = []
  if (label) out.push('... ' + label)
  for (let i = 0; i < n; i++) {
    const x = la[i]
    const y = lb[i]
    if (x === y) continue
    if (x !== undefined) out.push('-' + x)
    if (y !== undefined) out.push('+' + y)
  }
  return out.join(String.fromCharCode(10))
}

export function colorDiff(diffText) {
  return diffText
    .split(String.fromCharCode(10))
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return theme.bold(line)
      if (line.startsWith('+')) return theme.assistant(line)
      if (line.startsWith('-')) return theme.error(line)
      if (line.startsWith('...')) return theme.system(line)
      return line
    })
    .join(String.fromCharCode(10))
}

export default { unifiedDiff, colorDiff }
