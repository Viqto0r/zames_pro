import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fullScreenLayout } from '../src/tui/layout.ts'

// The full-screen layout MUST fit the terminal: the app renders a fixed-height
// column of `termRows`, and anything taller is clipped — the input rows are
// pushed off the screen and the caret drifts.
//
// The fixed part (header 2 + status 1 + input box + hint 1) already exceeds a
// very short terminal. `suggestRows` was clamped to the free space, but the
// PANEL itself never was: on a 5-row terminal `panelRows` stayed 7 and
// `logHeight` was clamped to 1, so the total was 8 rows — three rows beyond the
// screen.

function layout(termRows: number, buf = '') {
  return fullScreenLayout({
    termRows,
    cols: 40,
    prompt: '> ',
    buf,
    cursor: buf.length,
    suggestRows: 0,
  })
}

test('the panel never exceeds a very short terminal', () => {
  for (let termRows = 1; termRows <= 12; termRows++) {
    const l = layout(termRows)
    const total = Math.max(l.panelRows, l.logHeight) + 0
    assert.ok(
      l.panelRows <= termRows && l.logHeight <= Math.max(1, termRows),
      'termRows ' + termRows + ': panel ' + l.panelRows + ' log ' + l.logHeight,
    )
    assert.ok(total <= Math.max(termRows, 1), 'total ' + total)
  }
})

test('a normal terminal keeps its reserved rows untouched', () => {
  const l = layout(30)
  assert.equal(l.panelRows, 7)
  assert.equal(l.logHeight, 23)
  assert.equal(l.cursorTop, 2 + 23 + 1 + 1)
})
