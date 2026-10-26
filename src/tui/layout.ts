// PURE layout arithmetic for the FULL-SCREEN TUI. The component used to compute
// the panel height and the caret row separately; when the panel already fills
// the terminal the two disagreed by a row and the caret landed BELOW the input
// box. One function now owns the numbers, so the reserved rows and the caret
// can never drift apart.

import { inputBoxRows } from '../input/layout.js'

/** Rows of the fixed header: the title row + the divider. */
export const HEADER_ROWS = 2
/** Rows of the status bar above the input box. */
const STATUS_ROWS = 1
/** Rows of the key hint UNDER the input box. */
export const HINT_ROWS = 1

export interface FullScreenLayoutInput {
  termRows: number
  cols: number
  prompt: string
  buf: string
  cursor: number
  /** Rows the slash-command suggestion popup occupies (0 when hidden). */
  suggestRows: number
}

export interface FullScreenLayout {
  headerRows: number
  statusRows: number
  hintRows: number
  /** Visual rows of the framed input box (2 borders + its text rows). */
  inputBoxRows: number
  suggestRows: number
  /** Rows taken by everything except the log viewport. */
  panelRows: number
  /** Rows the log viewport may use (at least 1). */
  logHeight: number
  /** Terminal rows ABOVE the first input row (the caret origin). */
  cursorTop: number
}

export function fullScreenLayout(
  input: FullScreenLayoutInput,
): FullScreenLayout {
  const termRows = Math.max(1, Math.floor(input.termRows) || 24)
  const cols = Math.max(1, Math.floor(input.cols) || 80)
  const box = inputBoxRows(input.prompt, input.buf, input.cursor, cols)
  const suggestRows = Math.max(0, Math.floor(input.suggestRows) || 0)
  const panelRows = HEADER_ROWS + STATUS_ROWS + box + suggestRows + HINT_ROWS
  const logHeight = Math.max(1, termRows - panelRows)
  // The caret counts the SAME viewport the reservation uses.
  const cursorTop = HEADER_ROWS + logHeight + suggestRows + STATUS_ROWS + 1
  return {
    headerRows: HEADER_ROWS,
    statusRows: STATUS_ROWS,
    hintRows: HINT_ROWS,
    inputBoxRows: box,
    suggestRows,
    panelRows,
    logHeight,
    cursorTop,
  }
}
