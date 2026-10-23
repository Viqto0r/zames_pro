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
    // The at-sign must START a reference: at the very beginning, after
    // whitespace/a bracket/a quote, or right after a LIST SEPARATOR (a comma
    // or a semicolon). A second at-sign WITHOUT a separator (`@a.ts@b.ts`) is
    // an email/decorator shape and is skipped — the glued path cannot be
    // inlined anyway.
    if (prev && !isRefBoundary(prev) && prev !== ',' && prev !== ';') {
      i++
      continue
    }
    let j = i + 1
    let tok = ''
    // The token is rejected WHOLE when it contains an at-sign that is NOT a
    // list separator — `@Component` / `user@host` are a decorator and an
    // email. Trimming the prefix at that at-sign would otherwise inline a
    // bogus path.
    let hadInnerAt = false
    // A token that contains an at-sign (`@Component`, `user@host`) is a
    // decorator / an email, NOT a file reference. The scan used to stop at
    // that at-sign and hand the PREFIX (`Component` … no) or, worse, the part
    // BEFORE it to the inliner. Now the whole token is rejected instead.
    const isRef = (t: string): boolean => t.length > 0 && !t.includes('@')
    while (j < n && !isRefEnd(chars[j])) {
      // A COMMA directly followed by another `@` starts the NEXT reference:
      // `@a.ts,@b.ts` is a list, and scanning to whitespace made the whole
      // `a.ts,@b.ts` one path, so neither file was inlined.
      if (chars[j] === ',' && chars[j + 1] === '@') break
      // A SEMICOLON or a second at-sign also separates list items. Scanning
      // to whitespace made `a.ts;@b.ts` ONE path whose extension consumed the
      // separator, so `looksLikeToken` failed and BOTH files were dropped.
      if ((chars[j] === ';' || chars[j] === '@') && chars[j + 1] === '@') break
      // An at-sign followed by an ordinary char is part of the token (an
      // email/decorator) — remember it so the token is rejected below.
      if (chars[j] === '@') hadInnerAt = true
      tok += chars[j]
      j++
    }
    const cleaned = stripRefPunct(tok)
    if (
      !hadInnerAt &&
      isRef(cleaned) &&
      looksLikeToken(cleaned) &&
      !seen.has(cleaned)
    ) {
      seen.add(cleaned)
      out.push(cleaned)
    }
    // The break above leaves `j` ON the comma; step past it so the next `@`
    // is seen as the start of a reference. When the scan ended on a
    // terminator instead, continue AFTER it.
    // The scan stopped ON a separator that split the token (`,`, `;` or a
    // second at-sign): resume AT it so the next part is scanned as its own
    // reference. Continuing past it dropped the second file of a list.
    const sep = j < n ? chars[j] : ''
    if (j > i + 1 && (sep === ',' || sep === ';' || sep === '@')) i = j
    else i = j > i + 1 ? j : i + 1
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
