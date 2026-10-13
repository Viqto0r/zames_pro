// Unit tests for the input-box GEOMETRY helpers (src/input/layout.ts):
//   inputInnerCols() — inner wrap width of the framed box;
//   inputBoxRows()   — real height (border rows + VISUAL rows) for a buffer.
//
// These exist because the full-screen layout reserves the box height from a
// SEPARATE place than the box renders. When the reservation used the LOGICAL
// line count (buf.split('\n').length) a long wrapped line was under-counted,
// the second line printed over the first and the cursor drifted.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  inputInnerCols,
  inputBoxRows,
  layoutInput,
} from '../src/input/layout.ts'

const NL = String.fromCharCode(10)

const PROMPT = '> '
const COLS = 80

test('inputInnerCols: borders (2) + padding (2) are subtracted', () => {
  assert.equal(inputInnerCols(80), 76)
  assert.equal(inputInnerCols(20), 16)
  // Never below the 4-column floor (a tiny terminal must not wrap to 0).
  assert.equal(inputInnerCols(3), 4)
  assert.equal(inputInnerCols(0), 76)
})

test('inputBoxRows: empty buffer = 2 border rows + 1 text row', () => {
  assert.equal(inputBoxRows(PROMPT, '', 0, COLS), 3)
})

test('inputBoxRows: a plain newline adds one visual row', () => {
  const buf = 'a' + NL + 'b'
  assert.equal(inputBoxRows(PROMPT, buf, 3, COLS), 2 + 2)
})

test('inputBoxRows: a LONG wrapped line counts VISUAL rows, not newlines', () => {
  // Inner width = 76, prompt takes 2 on the first row -> 74 chars fit on row 1.
  // A 200-char word must wrap to several rows while there is NO newline at all.
  const long = 'x'.repeat(200)
  const rows = layoutInput(PROMPT, long, 200, inputInnerCols(COLS)).rows.length
  assert.ok(rows > 1, 'the line must wrap to more than one visual row')
  assert.equal(inputBoxRows(PROMPT, long, 200, COLS), 2 + rows)
  // The old logical-count formula would have said 3 (WRONG).
  assert.notEqual(inputBoxRows(PROMPT, long, 200, COLS), 3)
})

test('inputBoxRows: word-wrap of a multi-word line is counted', () => {
  const words = Array.from({ length: 40 }, () => 'word').join(' ')
  const rows = layoutInput(PROMPT, words, 0, inputInnerCols(COLS)).rows.length
  assert.ok(rows > 2)
  assert.equal(inputBoxRows(PROMPT, words, 0, COLS), 2 + rows)
})

test('inputBoxRows: mixed newlines and wrapping stack up', () => {
  const buf = 'a' + NL + 'y'.repeat(150) + NL + 'z'
  const rows = layoutInput(PROMPT, buf, buf.length, inputInnerCols(COLS)).rows
  assert.equal(inputBoxRows(PROMPT, buf, buf.length, COLS), 2 + rows.length)
})

test('inputBoxRows: never below 3 rows (2 borders + at least one line)', () => {
  assert.equal(inputBoxRows(PROMPT, '', 0, 3), 3)
})
