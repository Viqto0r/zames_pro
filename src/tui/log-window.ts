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
import { charWidth } from '../input/layout.js'

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
    // Use the SAME width rule as the input/status layout (charWidth in
    // src/input/layout.ts). The old table here counted EVERYTHING up to
    // U+9FFF as two cells, so a line of box arrows (`→`, U+2192), the
    // hourglass `⧗` (U+29D7) or Cyrillic/Greek letters over-estimated its
    // rows; at a narrow width that reserves an extra row per entry and the
    // pane believes it is full, stopping the scroll early. Sharing ONE table
    // keeps the viewport and the rest of the TUI from disagreeing.
    w += charWidth(cp)
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
  // The pane above the panel is flexGrow:1 and overflow="hidden" with
  // justifyContent="flex-end", so only the TAIL of a too-tall entry stays
  // visible. `used` must therefore count the VISIBLE rows of the entry being
  // kept, not its full height: counting the full height while scrolling
  // INSIDE a tall entry exceeded the reserved height and pushed the status /
  // input rows off a short terminal (the caret then drifted under the box).
  for (let i = entries.length - 1; i >= 0; i--) {
    const r = entryRows(entries[i], cols)
    let visibleRows = r
    if (skip > 0) {
      if (skip >= r) {
        skip -= r
        continue
      }
      // Partially scrolled into this entry: the rows above the fold are
      // hidden and must not be counted against the viewport.
      visibleRows = r - skip
      skip = 0
    }
    // The pane is flexGrow:1 + overflow="hidden" + flex-end, so a tall entry
    // is CLIPPED to its tail and never grows the window. A clipped entry is
    // therefore always kept — dropping it blanked the pane while the operator
    // scrolled inside a long answer (the old code required a free row for it).
    const clipped = r > cap || visibleRows < r
    if (!clipped && used + visibleRows > cap) break
    picked.push(entries[i])
    used += visibleRows
    // Only an EXACT fill stops the walk. A clipped entry already fills the
    // viewport visually but leaves room in the budget for the shorter entries
    // above it, which used to be dropped right after a tall one.
    if (!clipped && used >= cap) break
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
