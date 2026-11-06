import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText } from '../src/web.ts'

// The `<title>` of a page is page CHROME, not body text: a fetched document
// used to start with the title glued to the first paragraph (`Tb`), which read
// like a corrupted sentence. `<head>` (meta, style, title) is dropped whole.
const NL = String.fromCharCode(10)

test('a page title does not glue itself to the first paragraph', () => {
  const out = htmlToText(
    '<html><head><title>My page</title></head><body><p>Body</p></body></html>',
  )
  assert.ok(
    !out.includes('My page'),
    'the title leaked: ' + JSON.stringify(out),
  )
  assert.ok(out.includes('Body'), JSON.stringify(out))
})

test('a <pre> block is not cut at a `<` in code', () => {
  const out = htmlToText('<pre>if (a < b) { x() }</pre>')
  assert.ok(
    out.includes('if (a < b)') || out.includes('if (a < b) { x() }'),
    'the code was cut at `<`: ' + JSON.stringify(out),
  )
})
