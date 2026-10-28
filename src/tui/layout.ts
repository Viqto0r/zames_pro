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
  /** Horizontal border columns of the input box: 2 with a frame, 0 for
   *  ui.inputBorder=none (the wrap width and the reserved height change). */
  borderCols?: number
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
  // `cols` is the WIDTH OF A PANE, not of the terminal: the full-screen app
  // puts a gutter on both sides (screenInnerCols), and the input box wraps to
  // exactly that inner width. Using the terminal width here reserved one row
  // too few the moment a long input filled the pane (the box then wrapped an
  // extra line and the caret drifted), so the caller MUST pass the inner
  // width — and the pure helper stays consistent with what it renders.
  const cols = Math.max(1, Math.floor(input.cols) || 80)
  const box = inputBoxRows(
    input.prompt,
    input.buf,
    input.cursor,
    cols,
    input.borderCols ?? 2,
  )
  const suggestRows = Math.max(0, Math.floor(input.suggestRows) || 0)
  const panelRows = HEADER_ROWS + STATUS_ROWS + box + suggestRows + HINT_ROWS
  const logHeight = Math.max(1, termRows - panelRows)
  // The caret counts the SAME viewport the reservation uses.
  // The suggestion popup is drawn ABOVE the box and the box does NOT move, so
  // the caret row must NOT include `suggestRows`: adding it put the terminal
  // caret on the popup line (the operator saw the block cursor between
  // `/chats` and the box). The popup only SHRINKS the log viewport — which
  // `logHeight` above already accounts for.
  // `cursorTop` is the row of the input BOX top border (the popup and the
  // buffer rows are added by InputLine, where they are actually rendered).
  const cursorTop = HEADER_ROWS + logHeight + STATUS_ROWS + 1
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
