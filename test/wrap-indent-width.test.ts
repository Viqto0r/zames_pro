import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wrapToWidth, visLen } from '../src/input/layout.ts'

const NL = String.fromCharCode(10)

// `wrapToWidth` reproduces the line's leading INDENT verbatim on every wrapped
// line and hard-splits a word longer than the width. A deep indent plus a long
// word therefore produced a first line that was the indent glued to `width`
// MORE columns — the "wrapping keeps every line within the margin" promise was
// broken exactly where it matters (a pasted stack trace with a deep indent is
// echoed as the operator's message, width-2). Every output line must fit.
test('a deeply indented long word never exceeds the width', () => {
  for (const width of [4, 5, 6, 10]) {
    const out = wrapToWidth('    abcdefghij', width).split(NL)
    for (const line of out) {
      assert.equal(
        visLen(line) <= width,
        true,
        `width ${width}: ${JSON.stringify(line)} is ${visLen(line)} cols`,
      )
    }
  }
})

test('an indent wider than the width is still bounded', () => {
  const out = wrapToWidth('      abc', 4).split(NL)
  for (const line of out) {
    assert.equal(visLen(line) <= 4, true, JSON.stringify(line))
  }
})

test('normal wrapping keeps its indent and stays within the margin', () => {
  const out = wrapToWidth('  aaa bbb ccc', 7).split(NL)
  for (const line of out) assert.equal(visLen(line) <= 7, true, line)
  assert.equal(out[0].startsWith('  '), true)
})
