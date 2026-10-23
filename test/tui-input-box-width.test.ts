import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inputBoxRows, inputInnerCols } from '../src/input/layout.ts'

// The full-screen layout RESERVES the input box height with `inputBoxRows()`,
// which wraps to `inputInnerCols(cols)`. The InputLine component used to
// compute its own width (`Math.max(4, cols - 4)`) — a second, independent copy
// of the same rule. One number for the reservation and another for the render
// is exactly how the box ends up drawing rows the layout never reserved.
//
// A structural guard (the component cannot be rendered in a unit test without
// Ink): the component must read the SHARED helper.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/tui/InputLine.tsx'), 'utf-8')

test('InputLine wraps with the shared inputInnerCols helper', () => {
  assert.match(
    src,
    /const innerCols = inputInnerCols\(cols\)/,
    'InputLine must use inputInnerCols(cols), not a hand-written cols - 4',
  )
  // The COMPUTATION must not be hand-written again (the comment above it may
  // quote the old expression, so match on a code line only).
  assert.doesNotMatch(
    src,
    /^\s*const innerCols = Math\.max\(4,\s*cols - 4\)\s*$/m,
    'the hand-written width copy is back',
  )
})

// The two sides must agree for the width a narrow terminal produces, which is
// where a one-column drift shows up as an extra row.
test('the reserved height matches the rows the same width produces', () => {
  for (const cols of [20, 40, 80, 120]) {
    const inner = inputInnerCols(cols)
    const buf = 'x'.repeat(inner * 2)
    const reserved = inputBoxRows('> ', buf, buf.length, cols)
    // 2 border rows + the visual rows for the SAME inner width.
    assert.equal(reserved, 2 + Math.ceil(buf.length / (inner - 1)))
  }
})
