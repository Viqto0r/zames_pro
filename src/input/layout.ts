import type { Locale } from '../i18n.js'

// Terminal INPUT-LINE layout + formatting helpers — the PURE half of the
// LineEditor (src/input.ts). No terminal access, no state: given a prompt, a
// buffer, a cursor and a width these compute the visual rows, the cursor
// position, the visible width (wide chars count 2) and the status formatting.
// Split out (C3 step 3) so the geometry can be unit-tested without driving the
// real editor, and so the editor class keeps only render/key handling.

// All control characters are assembled from codes so the file has no
// "raw" ESC/CR/LF in string literals (see AGENTS.md).
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const ESC = String.fromCharCode(27)
const PASTE_START = ESC + '[200~'
const PASTE_END = ESC + '[201~'

// A large paste (3+ lines) is collapsed in the input line into a short
// marker "[Pasted lines#N]" so the line stays readable; the original text is
// kept aside and expanded back on submit. Pastes of 1–2 lines are inserted
// as-is (small pastes are usually short and don't clutter the line).
export const PASTE_MIN_LINES = 3

// How many slash-command hints are shown at once (the rest are paged with
// Ctrl+N/P). The list used to be hard-capped at 8 with a "...more" note and no
// way to reach the rest.
export const SUGGEST_PAGE = 8

// True when `q` is a subsequence of `s` (e.g. "hst" in "/history"). Used for
// the fuzzy fallback in _suggestions().
export function isSubsequence(q: string, s: string): boolean {
  let i = 0
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) i++
  }
  return i === q.length
}

export interface PasteBlock {
  marker: string
  text: string
}

// Number of lines in a pasted block (the trailing newline doesn't add a line).
export function countPasteLines(raw: string): number {
  const normalized = String(raw)
    .split(CR + NL)
    .join(NL)
    .split(CR)
    .join(NL)
  const trimmed = normalized.replace(/\n+$/, '')
  if (trimmed === '') return 1
  return trimmed.split(NL).length
}

export function formatPasteMarker(lines: number): string {
  return '[Pasted lines#' + lines + ']'
}

// Decide how to represent a pasted block: null — insert as-is (small paste),
// otherwise { marker, text }: the marker goes into the input line, and the
// original text is expanded back on submit.
export function pasteReplacement(raw: string): PasteBlock | null {
  const text = String(raw)
    .split(CR + NL)
    .join(NL)
    .split(CR)
    .join(NL)
  const lines = countPasteLines(text)
  if (lines < PASTE_MIN_LINES) return null
  return { marker: formatPasteMarker(lines), text }
}

// Replace "[Pasted lines#N]" markers with the original pasted text (the first
// occurrence in order — matches the order in which the pastes were inserted).
export function expandPastes(pastes: PasteBlock[], text: string): string {
  let out = text
  for (const p of pastes) {
    const idx = out.indexOf(p.marker)
    if (idx !== -1) {
      out = out.slice(0, idx) + p.text + out.slice(idx + p.marker.length)
    }
  }
  return out
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

// How many visual lines the text occupies at the given terminal width
// (accounting for wrapping). Needed so the cursor/block erase don't drift
// when the status is longer than the terminal width and wraps onto 2+ lines.
export function visRows(s: string, cols: number): number {
  const width = Math.max(1, Number(cols) || 80)
  const len = visLen(s)
  return Math.max(1, Math.ceil(len / width))
}

// Visible length of a line without ANSI sequences. WIDE characters (emoji,
// CJK) count as 2 columns — a plain code-point count made the status-line
// arithmetic (right-align, wrapping, block erase) disagree with the real
// screen, so a status containing an emoji/CJK could wrap past the edge and
// make the block erase miss (status "stacking"). Combining marks and the
// zero-width joiner/space/variation selectors count as 0.
export function visLen(s: string): number {
  s = String(s)
  let n = 0
  let i = 0
  while (i < s.length) {
    if (s.charCodeAt(i) === 27) {
      i++
      if (s[i] === '[') {
        i++
        while (i < s.length && !/[A-Za-z]/.test(s[i])) i++
        i++
      }
      continue
    }
    const cp = s.codePointAt(i) as number
    n += charWidth(cp)
    i += cp > 0xffff ? 2 : 1
  }
  return n
}

// Display width of one code point in columns (0, 1 or 2). Based on the
// conventional wcwidth ranges — good enough for terminal layout, and it makes
// the emoji used in the status line (🧠🌐) count as 2, while math symbols like
// ⧗ (U+29D7) stay 1, matching a real terminal.
export function charWidth(cp: number): number {
  // Zero width: combining marks, ZWJ/ZWNJ, variation selectors.
  if (
    cp === 0x200b ||
    cp === 0x200c ||
    cp === 0x200d ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  ) {
    return 0
  }
  // Wide: CJK, Hangul, fullwidth forms, emoji.
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f000 && cp <= 0x1f02f) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2
  }
  return 1
}

// Truncate a PLAIN (no-ANSI) string to at most `maxCols` visible columns,
// appending an ellipsis when it was cut. Used for one-line previews (tool call
// args, tool results) so a long argument cannot print a line wider than the
// terminal — which made some terminals show a horizontal scrollbar.
// Word-wrap a PLAIN (no-ANSI) string to at most `maxCols` visible columns per
// line. Used for service messages printed above the input (warnings): the
// terminal's OWN wrap breaks at the full width and mid-word, while our previews
// stop at cols-1 — the mismatch looked ragged. Wrapping here keeps every line
// inside the same margin. A single word longer than the width is hard-split so
// it never overflows.
export function wrapToWidth(s: string, maxCols: number): string {
  const width = Math.max(1, Math.floor(maxCols))
  const text = String(s ?? '')
  const out: string[] = []
  for (const raw of text.split(NL)) {
    if (raw === '') {
      out.push('')
      continue
    }
    let line = ''
    let lineW = 0
    for (const word of raw.split(' ')) {
      const w = visLen(word)
      // Hard-split a word longer than a whole line.
      if (w > width) {
        if (line) {
          out.push(line)
        }
        let piece = ''
        let pieceW = 0
        for (const ch of word) {
          const cw = charWidth(ch.codePointAt(0) as number)
          if (pieceW + cw > width) {
            out.push(piece)
            piece = ''
            pieceW = 0
          }
          piece += ch
          pieceW += cw
        }
        line = piece
        lineW = pieceW
        continue
      }
      const sep = line ? 1 : 0
      if (lineW + sep + w > width) {
        out.push(line)
        line = word
        lineW = w
      } else {
        line = line ? line + ' ' + word : word
        lineW += sep + w
      }
    }
    out.push(line)
  }
  return out.join(NL)
}

export function truncateToWidth(s: string, maxCols: number): string {
  const width = Math.max(1, Math.floor(maxCols))
  const text = String(s ?? '')
  if (visLen(text) <= width) return text
  // Reserve one column for the ellipsis.
  const budget = Math.max(0, width - 1)
  let used = 0
  let out = ''
  for (const ch of text) {
    const w = charWidth(ch.codePointAt(0) as number)
    if (used + w > budget) break
    out += ch
    used += w
  }
  return out + '…'
}

// Layout of the input into visual lines accounting for terminal width.
// Returns the lines (with prefix) and the cursor position in visual coordinates.
export interface LayoutRow {
  prefix: string
  text: string
  start: number
}

export interface LayoutResult {
  rows: LayoutRow[]
  cursorRow: number
  cursorCol: number
}

export function layoutInput(
  promptStr: string,
  buf: string,
  cursor: number,
  cols: number,
): LayoutResult {
  // Reserve the LAST column. If a printed row reaches exactly `cols` columns,
  // terminals with autowrap (Tabby, iTerm, Windows Terminal, xterm's default
  // deferred wrap) either wrap the cursor to the next line or leave it in the
  // last cell with a "pending wrap". In both cases the editor's row count
  // disagrees with the real screen by one, so the cursor/erase arithmetic in
  // `_renderInputOnly`/`_writeBlock` walks one row too far and the input line
  // climbs. This was most visible in an EMPTY chat with a single long,
  // space-less line (which fills the row exactly) and when moving the cursor
  // with the arrow keys.
  const width = Math.max(2, (Number(cols) || 80) - 1)
  const promptW = visLen(promptStr)
  const pad = ' '.repeat(promptW)
  const chars = Array.from(String(buf))
  const cur = Math.max(0, Math.min(Number(cursor) || 0, chars.length))
  const rows = []
  let i = 0
  while (true) {
    const first: boolean = rows.length === 0
    const prefix: string = first ? promptStr : pad
    const avail = Math.max(1, width - promptW)
    const start = i

    // Build the next visual line. First we take as many
    // characters as fit (columns < avail). If we hit the width
    // and the next character is not the end of the line, we roll back to the
    // last space so we don't split a word in the middle (word-wrap).
    // Wrapping and the cursor column are measured in COLUMNS (charWidth),
    // not code points — otherwise a CJK/emoji input would overflow the row
    // and put the cursor on the wrong cell.
    let text = ''
    let widthUsed = 0
    let charIdx = 0
    let lastSpace = -1 // char index of the space within text
    while (i < chars.length && chars[i] !== NL) {
      const w = charWidth(chars[i].codePointAt(0) as number)
      if (widthUsed + w > avail) break
      if (chars[i] === ' ') lastSpace = charIdx
      text += chars[i]
      i++
      charIdx++
      widthUsed += w
    }
    const atLineEnd = i >= chars.length || chars[i] === NL
    if (!atLineEnd && widthUsed >= avail && lastSpace > 0) {
      // Move the "tail" of the line to the next visual line.
      const textChars = Array.from(text)
      const tailLen = textChars.length - lastSpace
      i -= tailLen
      text = textChars.slice(0, lastSpace).join('')
    }

    if (i < chars.length && chars[i] === NL) {
      i++
      rows.push({ prefix, text, start })
      continue
    }
    rows.push({ prefix, text, start })
    if (i >= chars.length) break
  }

  let cursorRow = 0
  let cursorCol = promptW
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const rowChars = Array.from(row.text)
    const len = rowChars.length
    const from = row.start
    const to = row.start + len
    if (cur >= from && cur <= to) {
      const next = rows[r + 1]
      if (cur === to && next && next.start === to) continue
      cursorRow = r
      // Cursor column in COLUMNS (wide chars count as 2).
      let w = 0
      for (let k = 0; k < cur - from; k++) {
        w += charWidth(rowChars[k].codePointAt(0) as number)
      }
      cursorCol = promptW + w
      break
    }
  }
  return { rows, cursorRow, cursorCol }
}

export interface SlashCommand {
  name: string
  description: string
  /** Optional argument hint shown after the name in the suggest list (B7),
   *  e.g. `<file> [focus]`. Display only — never inserted into the line. */
  hint?: string
}

export interface LineEditorOptions {
  prompt?: string
  commands?: SlashCommand[]
  locale?: Locale
}

// Format a token count for the status line: compact (10k, 125k) plus the
// percentage of CONTEXT_LIMIT. Exported so it is unit-tested without a live
// editor. A null/undefined/NaN count renders an empty string (no status).
export const CONTEXT_LIMIT = 1_000_000

// Thresholds for coloring the context counter. Below YELLOW the value is
// green (plenty of room), between YELLOW and RED it is yellow (getting full),
// above RED it is red (nearly exhausted). Percent of CONTEXT_LIMIT.
export const CONTEXT_YELLOW_PCT = 50
export const CONTEXT_RED_PCT = 80

// The color role for a context fill level, as a stable string so it can be
// unit-tested without a terminal: 'ok' | 'warn' | 'high'. Null tokens -> null.
export function tokenStatusLevel(
  tokens: number | null | undefined,
  limit = CONTEXT_LIMIT,
): 'ok' | 'warn' | 'high' | null {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) {
    return null
  }
  const pct = (tokens / limit) * 100
  if (pct >= CONTEXT_RED_PCT) return 'high'
  if (pct >= CONTEXT_YELLOW_PCT) return 'warn'
  return 'ok'
}

export function formatTokenStatus(
  tokens: number | null | undefined,
  limit = CONTEXT_LIMIT,
): string {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) {
    return ''
  }
  const n = Math.round(tokens)
  const compact = formatCompactTokens(n)
  const pct = Math.max(0, (n / limit) * 100)
  const pctStr = pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1)
  // "ctx:" marks this as the USED context size, so the operator does not have
  // to guess what "302k · 30%" means.
  return 'ctx: ' + compact + ' · ' + pctStr + '%'
}

// Compact token count (10k, 125k, 1.5M). Exported so the per-task summary
// reuses the EXACT same "k/M" formatting as the context counter. Invalid
// input (null/NaN/negative) renders an empty string.
export function formatCompactTokens(tokens: number | null | undefined): string {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) {
    return ''
  }
  const n = Math.round(tokens)
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return (Number.isInteger(m) ? String(m) : m.toFixed(1)) + 'M'
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return (
      (k >= 100 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '')) +
      'k'
    )
  }
  return String(n)
}

// Re-exported for the editor's layout selftest (node src/input.js --selftest).
export { NL, CR, ESC, PASTE_START, PASTE_END, safeJson }
