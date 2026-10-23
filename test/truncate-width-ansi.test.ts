// truncateToWidth()/wrapToWidth() take a PLAIN string — the tool-call and
// tool-result previews are plain. But truncateToWidth counted the raw code
// points, so an ANSI escape (or any styled text that slipped through) was
// consumed by the budget and the cut landed INSIDE the escape sequence:
// `\x1b[31mabcdef` at width 4 became `\x1b[3…`, which is a broken control
// sequence (the terminal swallows the following text) and has ZERO visible
// columns.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToWidth, visLen } from '../src/input/layout.js'

const ESC = String.fromCharCode(27)

test('truncateToWidth never cuts inside an ANSI escape', () => {
  const out = truncateToWidth(ESC + '[31mabcdef' + ESC + '[0m', 4)
  assert.ok(
    !/\u001b\[[0-9;]*$/.test(out),
    'escape cut in half: ' + JSON.stringify(out),
  )
  assert.ok(
    visLen(out) > 0,
    'result has no visible columns: ' + JSON.stringify(out),
  )
})

test('truncateToWidth on plain text is unchanged (control)', () => {
  assert.equal(truncateToWidth('abcdef', 4), 'abc…')
})
