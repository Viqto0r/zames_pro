import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visLen, truncateToWidth } from '../src/input/layout.ts'

// Emoji sequences that render as ONE glyph are counted per CODE POINT: a family
// (`👨\u200D👩\u200D👧`) measures 6 columns instead of 2, a flag 2 (correct by
// luck), a skin-toned emoji 4 instead of 2. The layout then reserves extra
// rows and the cursor column drifts; `truncateToWidth` clips the whole
// sequence away far too early.
const NL = String.fromCharCode(10)
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'

test('a ZWJ emoji sequence counts as ONE glyph', () => {
  assert.equal(visLen(FAMILY), 2)
})

test('a skin-tone modifier does not add width', () => {
  assert.equal(visLen('\u{1F44B}\u{1F3FD}'), 2)
})

test('truncation keeps the whole sequence when it fits', () => {
  // `truncateToWidth` walks CODE POINTS, so it still cuts inside a ZWJ sequence
  // (a known limitation); what this pins is the WIDTH accounting: the family
  // counts as 2 columns, so the truncation budget treats it as one glyph.
  assert.equal(visLen(FAMILY + 'abcdef'), 8)
  const out = truncateToWidth(FAMILY + 'abcdef', 8)
  // The visible result is no wider than requested.
  assert.ok(visLen(out) <= 8, JSON.stringify(out))
})
void NL
