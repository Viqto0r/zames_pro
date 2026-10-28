import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GUTTER_MIN_COLS,
  screenGutter,
  screenInnerCols,
  inputInnerCols,
} from '../src/input/layout.ts'
import { fullScreenLayout, HEADER_ROWS } from '../src/tui/layout.ts'

// The operator asked for breathing room: on a wide terminal the UI used to be
// pinned to both edges (most visible after a theme switch, where the themed
// background only covers what we paint). The gutter must be:
//  - present on a normal/wide terminal,
//  - dropped on a narrow one (the panes would lose more than they gain),
//  - consistent across the header, the log wrap, the status bar and the input
//    box, because a mismatch is exactly the bug class that wrapped the header
//    onto a second row or clipped an input row.

test('a wide terminal gets a gutter on each side', () => {
  assert.equal(screenGutter(170), 2)
  assert.equal(screenGutter(80), 2)
  assert.equal(screenInnerCols(170), 166)
  assert.equal(screenInnerCols(80), 76)
})

test('a narrow terminal keeps every column', () => {
  assert.ok(GUTTER_MIN_COLS > 20)
  assert.equal(screenGutter(GUTTER_MIN_COLS - 1), 0)
  assert.equal(screenInnerCols(40), 40)
})

test('the inner width is never degenerate', () => {
  assert.ok(screenInnerCols(1) >= 4)
  assert.ok(screenInnerCols(0) >= 4)
})

test('the input box wraps to the PANE, not the terminal', () => {
  // The same buffer at the same terminal width must take the same number of
  // rows in the full-screen layout as the box itself renders.
  const buf = 'x'.repeat(120)
  const terminal = 60
  const pane = screenInnerCols(terminal)
  const lay = fullScreenLayout({
    termRows: 40,
    cols: pane,
    prompt: '❯ ',
    buf,
    cursor: buf.length,
    suggestRows: 0,
    borderCols: 2,
  })
  const expectedTextRows = Math.ceil((buf.length + 2) / (pane - 4))
  assert.equal(lay.inputBoxRows, expectedTextRows + 2)
  // Header rows are reserved exactly once.
  assert.equal(lay.headerRows, HEADER_ROWS)
  assert.ok(lay.logHeight >= 1)
  // The caret origin sits below the header, the viewport, the status row and
  // the box's top border.
  assert.equal(lay.cursorTop, HEADER_ROWS + lay.logHeight + lay.statusRows + 1)
})

test('inputInnerCols stays the single wrap number for the box', () => {
  // The box pads 1 column on each side of its text, so its text wraps to
  // pane - border - 2.
  assert.equal(inputInnerCols(80, 2), 76)
  assert.equal(inputInnerCols(80, 0), 78)
})
