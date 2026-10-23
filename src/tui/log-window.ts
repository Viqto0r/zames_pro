// PURE windowing of the full-screen log BY RENDERED ROW.
//
// The old viewport sliced `log` by ENTRY COUNT: one long wrapped answer could
// fill (or overflow) the panel while a run of short tool lines left it half
// empty. Windowing by rows needs each entry's rendered height, which this
// module estimates from the text and the terminal width. It is an ESTIMATE on
// purpose: measuring the real Yoga layout per entry would need a ref per row
// and a re-render, while counting wrapped lines is exact enough for a log and
// costs nothing.

import type { LogEntry } from './store.js'

/** Visible width of a line without ANSI escapes (wide chars count 2). */
function visWidth(s: string): number {
  let w = 0
  let i = 0
  while (i < s.length) {
    if (s.charCodeAt(i) === 27) {
      i++
      if (s[i] === '[') {
        i++
        while (i < s.length && !/[A-Za-z]/.test(s[i])) i++
        i++
      } else if (s[i] === ']') {
        // OSC sequence: `ESC ] ... (BEL | ESC \)`. OSC-8 hyperlinks
        // (produced by renderMarkdown when the terminal supports them) wrap
        // the LABEL in such a sequence, and the OLD parser did not skip it:
        // every URL character counted as a visible column, so the viewport
        // believed a short link line filled many rows and the log jumped.
        i++
        while (i < s.length) {
          const c = s.charCodeAt(i)
          if (c === 7) {
            i++
            break
          }
          if (c === 27 && s[i + 1] === String.fromCharCode(92)) {
            i += 2
            break
          }
          i++
        }
      }
      continue
    }
    const cp = s.codePointAt(i) as number
    // Wide ranges (CJK/emoji) count 2; combining marks 0. Approximate — a log
    // windowing error of one cell is invisible.
    if (cp >= 0x1f300 && cp <= 0x1faff) w += 2
    else if (cp >= 0x1100 && cp <= 0x9fff) w += 2
    else if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200d) w += 0
    else w += 1
    i += cp > 0xffff ? 2 : 1
  }
  return w
}

/**
 * How many terminal rows one log entry occupies at `cols` columns. A line
 * longer than the width wraps (Ink uses hard wrapping for these rows). An
 * empty line still takes one row.
 *
 * `floor` gives the UNDER-estimate used to RESERVE the log viewport height;
 * the exact `ceil` is what the content really renders, so the two together let
 * the log box take the slack (see FullScreenApp) without ever overflowing —
 * an overflow is what pushed the input rows below the terminal and left the
 * caret drifting under the box on a short terminal.
 */
export function entryRows(
  entry: LogEntry,
  cols: number,
  mode: 'exact' | 'floor' = 'exact',
): number {
  const width = Math.max(1, cols)
  const lines = String(entry.text ?? '').split(String.fromCharCode(10))
  let rows = 0
  for (const line of lines) {
    const w = visWidth(line)
    const n = mode === 'floor' ? Math.floor(w / width) : Math.ceil(w / width)
    rows += Math.max(1, n)
  }
  return Math.max(1, rows)
}

/**
 * Slice the log so its RENDERED height fits `height` rows, keeping `scroll`
 * rows hidden from the bottom (0 = pinned to the newest). Returns the visible
 * entries. A single entry taller than the viewport is kept whole (its tail
 * is shown) rather than dropped — the pane is overflow="hidden" with
 * justifyContent="flex-end", so the TAIL is what stays on screen.
 */
export function windowByRows(
  entries: LogEntry[],
  height: number,
  scroll: number,
  cols: number,
): LogEntry[] {
  const cap = Math.max(1, Math.floor(height))
  // Walk from the newest entry backwards, accumulating rows, skipping `scroll`
  // rows from the bottom first.
  let skip = Math.max(0, Math.floor(scroll))
  const picked: LogEntry[] = []
  let used = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    const r = entryRows(entries[i], cols)
    if (skip > 0) {
      if (skip >= r) {
        skip -= r
        continue
      }
      // Partially scrolled into this entry: keep the hidden part accounted.
      skip = 0
    }
    if (used + r > cap && picked.length > 0) break
    picked.push(entries[i])
    used += r
    if (used >= cap) break
  }
  picked.reverse()
  return picked
}

/** Total rendered rows of a list of entries (for maxScroll). */
export function totalRows(
  entries: LogEntry[],
  cols: number,
  mode: 'exact' | 'floor' = 'exact',
): number {
  let n = 0
  for (const e of entries) n += entryRows(e, cols, mode)
  return n
}
