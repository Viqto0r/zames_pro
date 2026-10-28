import type { Locale } from '../i18n.js'

// Terminal INPUT-LINE layout + formatting helpers — the PURE half of the
// LineEditor (src/input.ts). No terminal access, no state: given a prompt, a
// buffer, a cursor and a width these compute the visual rows, the cursor
// position, the visible width (wide chars count 2) and the status formatting.
// Split out so the geometry can be unit-tested without driving the
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
  // Only the SINGLE last newline is a terminator (it does not open a new
  // line); any newline before it ends a real - possibly BLANK - line. The
  // old /\n+$/ stripped ALL trailing newlines, so a paste of "a\n\n\n"
  // counted as ONE line: it was inserted verbatim instead of collapsing into
  // a `[Pasted lines#N]` marker and flooded the input line.
  const trimmed = normalized.endsWith(NL) ? normalized.slice(0, -1) : normalized
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

// Replace "[Pasted lines#N]" markers with the original pasted text.
//
// The marker carries ONLY the line count, so two pastes of the same length are
// indistinguishable in the buffer. The old "last occurrence for the last paste"
// walk handed the SURVIVING marker the wrong body whenever the operator deleted
// the other one. The caller can also name the paste it deleted
// (`deletedIndex`), which removes the ambiguity completely; without it, an
// ambiguous case (two same-size pastes, exactly one marker left) cannot be
// resolved from the text, so the marker is left AS IS — sending the literal
// "[Pasted lines#3]" is visible to the operator, while the wrong body under a
// plausible marker silently sends the model someone else's text.
export function expandPastes(
  pastes: PasteBlock[],
  text: string,
  deletedIndex?: number,
): string {
  if (!pastes.length) return text
  const src = String(text)
  // Without a deletion hint, expansion is only unambiguous when the number of
  // surviving markers matches the number of pastes (nothing was deleted) or
  // the markers differ (different line counts).
  const occurrences = new Map<string, number>()
  for (const p of pastes) {
    occurrences.set(p.marker, (occurrences.get(p.marker) || 0) + 1)
  }
  let ambiguous = false
  for (const [marker, count] of occurrences) {
    let seen = 0
    let from = 0
    while (true) {
      const idx = src.indexOf(marker, from)
      if (idx === -1) break
      seen++
      from = idx + marker.length
    }
    if (seen === count) continue
    // Fewer markers than pastes means one was deleted; more than one survivor
    // of the same text cannot be attributed.
    if (seen > 1 || count > 1) ambiguous = true
  }
  if (deletedIndex !== undefined) ambiguous = false

  // With a KNOWN deletion index the mapping is exact: the remaining pastes in
  // order own the remaining markers in order.
  const pool =
    deletedIndex !== undefined &&
    deletedIndex >= 0 &&
    deletedIndex < pastes.length
      ? pastes.filter((_p, i) => i !== deletedIndex)
      : pastes
  let out = src
  let scanFrom = 0
  const positions: Array<{ p: PasteBlock; idx: number }> = []
  for (const p of pool) {
    const idx = out.indexOf(p.marker, scanFrom)
    if (idx === -1) continue
    positions.push({ p, idx })
    scanFrom = idx + p.marker.length
  }
  const survivors = pool.length
  const total = pastes.length
  const lost = total - pool.length
  const found = positions.length
  // Every marker left in the text must be accounted for, and every unmatched
  // paste must have actually lost its marker. Anything else is ambiguous.
  if (!ambiguous && (found !== survivors || lost < 0)) ambiguous = true
  if (ambiguous) return src
  for (let i = positions.length - 1; i >= 0; i--) {
    const { p, idx } = positions[i]
    out = out.slice(0, idx) + p.text + out.slice(idx + p.marker.length)
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
    // A line that already fits is returned VERBATIM: wrapping is a width
    // operation, not a normalizer. Splitting on spaces and re-joining ate the
    // leading indentation (and emptied a line of only spaces), so an indented
    // warning / echoed operator line lost its layout.
    if (visLen(raw) <= width) {
      out.push(raw)
      continue
    }
    // Wrapping is a WIDTH operation, not a normalizer: the spaces BETWEEN words
    // (and the leading indentation) belong to the line and are reproduced
    // verbatim. The old split(' ')/join(' ') glued the words back with ONE
    // separator, so `'aaa bbb'` at width 7 became `'aaabbb'` and an indented
    // warning lost its indent.
    const words = raw.split(/ +/).filter((w) => w !== '')
    // An INDENT deeper than the whole width can never be reproduced within
    // the margin: keeping it on the first line glued `width` MORE columns to
    // it (a pasted stack-trace line pushed the terminal into horizontal
    // scroll). It is clipped so every produced line fits.
    let indent = raw.slice(0, raw.length - raw.trimStart().length)
    if (visLen(indent) > width) indent = truncateToWidth(indent, width - 1)
    const avail = Math.max(1, width - visLen(indent))
    let line = indent
    let lineW = visLen(indent)
    let first = true
    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const w = visLen(word)
      // Hard-split a word that does not fit the REMAINING columns on this
      // line (the indent, plus any earlier word, consumes part of it).
      if (w > avail) {
        if (!first) {
          out.push(line)
          line = ''
          lineW = 0
        }
        let piece = ''
        let pieceW = 0
        let room = width - lineW
        for (const ch of word) {
          const cw = charWidth(ch.codePointAt(0) as number)
          if (pieceW + cw > room) {
            out.push(line + piece)
            line = ''
            lineW = 0
            room = width
            piece = ''
            pieceW = 0
          }
          piece += ch
          pieceW += cw
        }
        line += piece
        lineW += pieceW
        first = false
        continue
      }
      if (!first && lineW + 1 + w > width) {
        out.push(line)
        line = word
        lineW = w
        first = false
        continue
      }
      if (!first) {
        line += ' '
        lineW += 1
      }
      line += word
      lineW += w
      first = false
    }
    out.push(line)
  }
  return out.join(NL)
}

export function truncateToWidth(s: string, maxCols: number): string {
  // The callers derive the budget from the row width MINUS the tool name
  // (`contentWidth() - name.length - 6`), so a long name (an MCP tool id) on a
  // narrow pane produced a NEGATIVE budget and the whole detail collapsed to a
  // lone `…` — the operator saw no argument at all. A budget below 1 (the
  // ellipsis itself) is lifted to 2, so the head keeps ONE character next to
  // the marker instead of disappearing entirely.
  const requested = Number.isFinite(maxCols) ? Math.floor(maxCols) : 1
  const width = requested < 1 ? 2 : requested
  const text = String(s ?? '')
  if (visLen(text) <= width) return text
  // Reserve one column for the ellipsis.
  const budget = Math.max(0, width - 1)
  let used = 0
  let out = ''
  let i = 0
  while (i < text.length) {
    // Copy an ANSI escape WHOLE (zero columns). Counting its code points
    // consumed the budget and the cut landed inside the sequence
    // (`\x1b[3…`), leaving a broken control sequence with no visible text.
    if (text.charCodeAt(i) === 27 && text[i + 1] === '[') {
      let j = i + 2
      while (j < text.length && !/[A-Za-z]/.test(text[j])) j++
      const seq = text.slice(i, Math.min(j + 1, text.length))
      // A sequence the budget cannot even finish is dropped, never split.
      out += seq
      i += seq.length
      continue
    }
    const cp = text.codePointAt(i) as number
    const w = charWidth(cp)
    if (used + w > budget) break
    const ch = String.fromCodePoint(cp)
    out += ch
    used += w
    i += ch.length
  }
  // The visible text was cut BEFORE any trailing RESET, so the ellipsis and
  // everything printed after it on the row would inherit the last colour.
  // Close any style the kept prefix opened (the text may still be plain, in
  // which case the reset is harmless).
  const reset = out.includes(ESC + '[') ? ESC + '[0m' : ''
  return out + reset + '…'
}
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

// Inner content width of the framed input box: the border takes 1 column on
// each side (2 total, 0 when ui.inputBorder is 'none') and the box adds
// 1 column of padding on each side, so the text wraps to `cols - border - 2`. Exported so the layout ABOVE the box
// (FullScreenApp) and the box itself (InputLine) use ONE number — a mismatch
// made the reserved height disagree with the rendered rows and the panel
// overflowed.
export function inputInnerCols(cols: number, borderCols = 2): number {
  return Math.max(4, (Number(cols) || 80) - borderCols - 2)
}

/**
 * Horizontal gutter (columns on EACH side) that the full-screen layout keeps
 * free so the UI does not hug the terminal edges. The operator asked for it: on
 * a 170-column terminal the header, the answers and the input box were pinned
 * to column 0 with nothing breathing around them.
 *
 * A gutter is dropped entirely on a narrow terminal (< GUTTER_MIN_COLS): the
 * panes would otherwise lose more width than they gain in looks, and a deep
 * workdir in the header already competes for the same row.
 */
export const GUTTER_MIN_COLS = 60

export function screenGutter(cols: number): number {
  const c = Math.max(1, Math.floor(Number(cols) || 80))
  return c >= GUTTER_MIN_COLS ? 2 : 0
}

/**
 * Inner width of a full-screen pane: the terminal minus the gutter on BOTH
 * sides. One helper so the header, the log, the status bar and the input box
 * wrap and truncate to the SAME width — a mismatch is exactly the class of bug
 * that clipped an input row or wrapped a header title onto a second line.
 */
export function screenInnerCols(cols: number): number {
  const c = Math.max(1, Math.floor(Number(cols) || 80))
  const g = screenGutter(c)
  return Math.max(4, c - g * 2)
}

// Real height (rows) of the framed input box for the CURRENT buffer: 2 border
// rows + the number of VISUAL rows the buffer wraps to. Using the LOGICAL line
// count (buf.split('\n').length) was wrong: a long line wraps and renders MORE
// rows than it has newlines, so the box was reserved too few rows, the second
// line printed OVER the first and the cursor landed on the wrong row.
export function inputBoxRows(
  prompt: string,
  buf: string,
  cursor: number,
  cols: number,
  borderCols = 2,
): number {
  const inner = inputInnerCols(cols, borderCols)
  const rows = layoutInput(prompt, buf, cursor, inner).rows.length
  // Two BORDER rows only when a frame is drawn ('none' reserves just the text).
  const borderRows = borderCols > 0 ? 2 : 0
  return borderRows + Math.max(1, rows)
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
      //
      // The break happens AT a space, and that space belongs to neither row:
      // it is the wrap point. Leaving it in `text` printed a trailing space at
      // the end of the first row, and leaving it in the tail printed a LEADING
      // space on the continuation row (`❯ ф вйцв …` / `   йца …` — the
      // operator saw the extra indent on every wrapped line). Consume it.
      const textChars = Array.from(text)
      const tailLen = textChars.length - lastSpace - 1
      i -= tailLen
      text = textChars.slice(0, lastSpace).join('')
      // Skip the space itself so the next row starts at the word.
      i += 0
      // `text` may still contain the space as its LAST char when the break
      // lands right after it; trim it (the row must not end with blank space).
      text = text.replace(/ +$/, '')
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
  /** Optional argument hint shown after the name in the suggest list, e.g.
   *  `<file> [focus]`. Display only — never inserted into the line. */
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
// A usable context window: a finite POSITIVE number. The denominator comes
// from config (`ui.contextLimit` / a provider section), so a 0 / NaN /
// negative / Infinity value reaches these functions; dividing by it rendered
// `Infinity%` / `NaN%` (or a fake 0.0% and even 'high') on a real token
// count. An unusable window falls back to the default one.
function usableLimit(limit: number | null | undefined): number {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0
    ? limit
    : CONTEXT_LIMIT
}

export function tokenStatusLevel(
  tokens: number | null | undefined,
  limit = CONTEXT_LIMIT,
): 'ok' | 'warn' | 'high' | null {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) {
    return null
  }
  const pct = (tokens / usableLimit(limit)) * 100
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
  const pct = Math.max(0, (n / usableLimit(limit)) * 100)
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
  let n = Math.round(tokens)
  // Promote BEFORE rendering when the ROUNDED value would read as a full next
  // unit: 999 949 -> '1000k' (nonsense kilo) while the percentage beside it
  // already says 100%, and 999 950 000 -> '1000.0M'. Same rule as
  // attachments.formatSize.
  if (Math.round(n / 1000) >= 1000 && n < 1_000_000) n = 1_000_000
  if (Math.round((n / 1_000_000) * 10) / 10 >= 1000 && n < 1_000_000_000) {
    n = 1_000_000_000
  }
  if (n >= 1_000_000_000) {
    const b = n / 1_000_000_000
    return (Number.isInteger(b) ? String(b) : b.toFixed(1)) + 'B'
  }
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

/**
 * Split off a trailing PARTIAL PASTE marker so a control sequence fragmented
 * across two terminal reads is reassembled by the caller instead of leaking
 * into the buffer as literal text. A bracketed paste sends `ESC[200~` …
 * `ESC[201~`; a read can end anywhere inside one of those markers.
 *
 * Returns `{ head, tail }` where `tail` is the held-back partial marker (or
 * null when the string does not end inside a marker). Only tails that START
 * with ESC and are a genuine PREFIX of PASTE_START / PASTE_END are held, so an
 * ordinary trailing `[2` typed by hand is NOT swallowed.
 */
export function splitPasteTail(s: string): {
  head: string
  tail: string | null
} {
  const str = String(s ?? '')
  if (!str) return { head: str, tail: null }
  // The longest marker prefix to consider is one char short of the marker.
  const markers = [PASTE_START, PASTE_END]
  const maxHold = Math.max(...markers.map((m) => m.length)) - 1
  const upto = Math.min(maxHold, str.length - 1)
  for (let len = upto; len >= 1; len--) {
    const tail = str.slice(str.length - len)
    if (!tail.startsWith(ESC)) continue
    if (markers.some((m) => m.length > len && m.startsWith(tail))) {
      return { head: str.slice(0, str.length - len), tail }
    }
  }
  return { head: str, tail: null }
}
