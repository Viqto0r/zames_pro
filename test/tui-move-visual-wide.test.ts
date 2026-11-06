import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  insertText,
  moveVisualRows,
} from '../src/tui/edit.ts'
import { layoutInput } from '../src/input/layout.ts'

// Up/Down across a WRAPPED line must keep the visual COLUMN. `moveVisualRows`
// converts the caret's column to a desired width by walking
// `cursorCol - promptWidth` CHARACTERS of the current row — but a wide (CJK)
// glyph occupies TWO columns, so the walk overshoots: on a row of 3 CJK glyphs
// (6 columns) it reads 6 characters (3 real + 3 `undefined` counted as 1), and
// Up lands far to the right of the original column.

test('Up keeps the column on a wide-glyph wrapped line', () => {
  const s = insertText(initialEditState(), '中中中中中中')
  const lay = layoutInput('> ', s.buf, s.cursor, 10)
  assert.equal(lay.cursorRow, 1)
  // Cursor sits after the 3rd glyph of row 1: visual column 6 (0-based).
  const up = moveVisualRows(s, -1, '> ', 10)
  // Row 0 is '中中中' (3 glyphs = 6 columns); the caret must land on its END.
  assert.equal(up.cursor, 3, 'landed at ' + up.cursor)
})
