// Find a single file path inside arbitrary text (a pasted path surrounded by
// words, e.g. a quoted path followed by a question). Returns the cleaned path
// plus the text around it, or null. Implemented WITHOUT regular expressions so
// the source has no escaping pitfalls.
export function extractPathToken(
  text: string,
): { path: string; before: string; after: string } | null {
  const s = String(text || '')
  const chars = Array.from(s)
  const n = chars.length
  let i = 0
  while (i < n) {
    const c = chars[i]
    if (c === ' ' || c === '	') {
      i++
      continue
    }
    let start = i
    if (c === String.fromCharCode(39) || c === String.fromCharCode(34)) {
      const quote = c
      start = i + 1
      i = start
      while (i < n && chars[i] !== quote) i++
      const tok = chars.slice(start, i).join('')
      if (looksLikeToken(tok)) {
        const before = s.slice(0, start - 1)
        const after = i < n ? s.slice(i + 1) : ''
        return { path: tok, before, after }
      }
      if (i < n) i++
      continue
    }
    i = start
    while (i < n && chars[i] !== ' ' && chars[i] !== '	') i++
    const tok = chars.slice(start, i).join('')
    const cleaned = stripPunct(tok)
    if (looksLikeToken(cleaned)) {
      const before = s.slice(0, start)
      const after = s.slice(start + tok.length)
      return { path: cleaned, before, after }
    }
  }
  return null
}

function stripPunct(tok: string): string {
  let t = tok
  while (t.length && ',.!?;:)]'.includes(t[t.length - 1])) t = t.slice(0, -1)
  while (t.length && '(['.includes(t[0])) t = t.slice(1)
  return t
}

// Characters that may directly precede an '@' for it to count as a file
// reference rather than a decorator/email. Without this guard `user@host` and
// `@Component` would be misread as paths.
function isRefBoundary(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\n' ||
    ch === '\r' ||
    ch === '(' ||
    ch === '[' ||
    ch === '{' ||
    ch === String.fromCharCode(34) ||
    ch === String.fromCharCode(39) ||
    ch === '<'
  )
}

// End of a reference token: whitespace, a closing bracket/quote, or an
// angle bracket (so `@a.ts>` stops at `>`).
function isRefEnd(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\n' ||
    ch === '\r' ||
    ch === ')' ||
    ch === ']' ||
    ch === '}' ||
    ch === String.fromCharCode(34) ||
    ch === String.fromCharCode(39) ||
    ch === '<' ||
    ch === '>'
  )
}

// Strip trailing punctuation a path may have picked up from prose, e.g.
// "see @src/a.ts, please" -> `src/a.ts`.
function stripRefPunct(tok: string): string {
  let t = tok
  while (t.length && ',.;:!?'.includes(t[t.length - 1])) t = t.slice(0, -1)
  return t
}

// Find all `@path` references in a task text (B5). Returns the unique paths in
// order of appearance. A reference is an '@' at a word boundary followed by a
// token that looks like a file name/path (a known extension). Implemented
// without regular expressions, like extractPathToken, to keep the source free
// of escaping pitfalls.
export function extractAtFileRefs(text: string): string[] {
  const s = String(text || '')
  const chars = Array.from(s)
  const n = chars.length
  const out: string[] = []
  const seen = new Set<string>()
  let i = 0
  while (i < n) {
    if (chars[i] !== '@') {
      i++
      continue
    }
    const prev = i > 0 ? chars[i - 1] : ''
    if (prev && !isRefBoundary(prev)) {
      i++
      continue
    }
    let j = i + 1
    let tok = ''
    while (j < n && !isRefEnd(chars[j])) {
      tok += chars[j]
      j++
    }
    const cleaned = stripRefPunct(tok)
    if (cleaned && looksLikeToken(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned)
      out.push(cleaned)
    }
    i = j > i + 1 ? j : i + 1
  }
  return out
}

function looksLikeToken(tok: string): boolean {
  const t = String(tok || '')
  if (!t || t.length > 500) return false
  const dot = t.lastIndexOf('.')
  if (dot <= 0 || dot >= t.length - 1) return false
  const ext = t.slice(dot + 1)
  if (ext.length > 8) return false
  for (const ch of ext) {
    const ok =
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= '0' && ch <= '9')
    if (!ok) return false
  }
  return true
}
