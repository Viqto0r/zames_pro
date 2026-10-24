// moveVisualRows() (Up/Down inside a multi-line input) re-derives the target
// column from the LAYOUT. It computed `want = cursorCol - promptW` and then
// walked the TARGET row from its start, but `cursorCol` is the column of the
// CURRENT row, whose indent (`row.start`) is not the same as the target row's
// start — a wrapped buffer has rows starting at 0, 14, 27… so the walk
// measured the wrong distance and the cursor landed past the intended column
// (on the row with 40 chars: Up from the end landed on 27 instead of 14).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutInput } from '../src/input/layout.js'
import {
  moveVisualRows,
  initialEditState,
  insertText,
} from '../src/tui/edit.js'

const NL = String.fromCharCode(10)
const cols = 16

function columnOf(buf: string, cursor: number): number {
  return layoutInput('> ', buf, cursor, cols).cursorCol
}

test('Up keeps the cursor in the same visual column', () => {
  // The wrapped line's LAST row is short (`hhhh`, 10 chars) while the caret is
  // at its end (column 12). The row above starts at 35, not at the caret's
  // row start — the old arithmetic used `cursorCol - promptW` as a CHARACTER
  // offset and walked 10 chars from the TARGET start, landing on the NEXT
  // row (idx 45) instead of the same column on the row above.
  const buf = 'xxxxxxxxxxxxxxx' + NL + 'aaaa bbbb cccc dddd eeee ffff gggg hhhh'
  let s = { ...insertText(initialEditState(), buf) }
  const before = layoutInput('> ', buf, s.cursor, cols)
  s = moveVisualRows(s, -1, '> ', cols)
  const after = layoutInput('> ', buf, s.cursor, cols)
  // The caret stays on the row ABOVE (never jumps back to the same row).
  assert.equal(after.cursorRow, before.cursorRow - 1)
  // ...and as close to the same column as the shorter row allows (a column
  // past its last character clamps to the row end).
  assert.ok(
    Math.abs(after.cursorCol - before.cursorCol) <= 1,
    'column drifted from ' + before.cursorCol + ' to ' + after.cursorCol,
  )
})

test('Up moves exactly one visual row in a wrapped multiline buffer', () => {
  const buf = 'short' + NL + 'b'.repeat(40)
  let s = insertText(initialEditState(), buf)
  const before = layoutInput('> ', buf, s.cursor, cols).cursorRow
  s = moveVisualRows(s, -1, '> ', cols)
  const after = layoutInput('> ', buf, s.cursor, cols).cursorRow
  assert.equal(after, before - 1)
})
