// Single source of truth for the CONTENT column width used by every part
// of the terminal UI: the model's answers, the operator's echoed text,
// tool previews and service warnings. One width for all of them means nothing
// is printed at the full terminal width while something else stops at 100 --
// the mismatch looked ragged after a resize.
//
// 0 (default) = the FULL terminal width (minus one autowrap-safety column).
// The old default capped the content at 100 columns, which on a wide terminal
// left a wide empty band on the right of every answer; the operator asked for
// the text to use the whole width. A cap is still available per-run via
// `ui.answerWidth` when a narrower column is easier to read.
// > 0 = an explicit cap (still never wider than the terminal).
const DEFAULT_CONTENT_WIDTH = 0

let configured = 0

/** Set the configured content width (0 or a non-positive value = auto). */
export function setContentWidth(width: number): void {
  configured = typeof width === 'number' && width > 0 ? width : 0
}

/**
 * The effective content width in columns. One column is kept free (autowrap
 * safety), like the status/input layout. Never shorter than 20 columns.
 */
export function contentWidth(): number {
  const cols = process.stdout.columns || 80
  const cap = configured > 0 ? configured : DEFAULT_CONTENT_WIDTH
  // A cap of 0 means "no cap beyond the terminal": use every column except
  // the last one (autowrap safety).
  const limit = cap > 0 ? Math.min(cap, cols - 1) : cols - 1
  return Math.max(20, limit)
}
