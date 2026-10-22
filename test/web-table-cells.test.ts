import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText } from '../src/web.ts'

// A table row is rendered by joining cell text WITHOUT any separator, so
// `<td>Name</td><td>42</td>` became `Name42` — two independent values fused
// into one. A model reading a spec/pricing/status table then reported a value
// that never existed on the page.
test('htmlToText: table cells are separated', () => {
  const out = htmlToText('<table><tr><td>Name</td><td>42</td></tr></table>')
  assert.equal(out, 'Name 42')
})

test('htmlToText: rows stay on separate lines', () => {
  const out = htmlToText(
    '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>',
  )
  assert.equal(out, 'a b\nc d')
})
