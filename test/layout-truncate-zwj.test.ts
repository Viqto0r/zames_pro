import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToWidth, visLen } from '../src/input/layout.ts'

// A ZWJ emoji sequence is ONE glyph. Truncation walks code points, so it cuts
// INSIDE the sequence and leaves a dangling ZWJ (`👨\u200D…`): the terminal
// joins the following `…` to the emoji, so the truncation marker becomes
// invisible and the visible line is WIDER than the requested width (the emoji
// renders as two columns and the ellipsis is swallowed).
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'

test('a cut never leaves a dangling ZWJ', () => {
  for (const w of [3, 4, 5]) {
    const out = truncateToWidth(FAMILY + 'abcdef', w)
    assert.ok(
      !out.includes('\u200d…'),
      'a dangling ZWJ swallowed the ellipsis: ' + JSON.stringify(out),
    )
    assert.ok(visLen(out) <= w, 'wider than ' + w + ': ' + JSON.stringify(out))
  }
})
