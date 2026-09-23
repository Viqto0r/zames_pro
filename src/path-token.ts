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
 let quote = ''
 let start = i
 if (c === String.fromCharCode(39) || c === String.fromCharCode(34)) {
 quote = c
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

function looksLikeToken(tok: string): boolean {
 const t = String(tok || '')
 if (!t || t.length > 500) return false
 const dot = t.lastIndexOf('.')
 if (dot <= 0 || dot >= t.length - 1) return false
 const ext = t.slice(dot + 1)
 if (ext.length > 8) return false
 for (const ch of ext) {
 const ok =
 (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')
 if (!ok) return false
 }
 return true
}
