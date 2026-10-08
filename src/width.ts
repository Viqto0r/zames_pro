// Single source of truth for the CONTENT column width used by every part
// of the terminal UI: the model's answers, the operator's echoed text,
// tool previews and service warnings. One width for all of them means nothing
// is printed at the full terminal width while something else stops at 100 --
// the mismatch looked ragged after a resize.
//
// 0 (default) = auto: the terminal width, capped at DEFAULT_CONTENT_WIDTH.
// A longer line is harder to read and the eye loses the start of the next
// line on a wide terminal, so there is a cap.
// > 0 = an explicit cap (still never wider than the terminal).
export const DEFAULT_CONTENT_WIDTH = 100

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
  return Math.max(20, Math.min(cap, cols - 1))
}
