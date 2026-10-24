// truncateToWidth() cuts styled text by VISIBLE columns. It copies an ANSI
// escape whole, but everything AFTER the visible cut is dropped — including
// the colour RESET that usually sits right before the ellipsis. The result is
// `\x1b[31mabc…` with NO reset: the ellipsis (and every later character on
// that terminal row — the status bar's right half, the rest of a preview)
// inherits the colour. The same happens with a cut that ends inside a wide
// glyph run. The kept text must carry its own reset.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToWidth } from '../src/input/layout.ts'

const ESC = String.fromCharCode(27)

test('truncateToWidth keeps a colour reset after the cut', () => {
  const out = truncateToWidth(ESC + '[31mabcdef' + ESC + '[0m rest', 4)
  assert.ok(out.includes(ESC + '[0m'), 'no reset in ' + JSON.stringify(out))
  // The ellipsis must come AFTER the reset, so it is not coloured either.
  assert.ok(
    out.lastIndexOf(ESC + '[0m') > out.lastIndexOf('…') === false,
    'reset placement: ' + JSON.stringify(out),
  )
})

test('plain text is unchanged (control)', () => {
  assert.equal(truncateToWidth('abcdef', 4), 'abc…')
  assert.equal(truncateToWidth('abc', 10), 'abc')
})
