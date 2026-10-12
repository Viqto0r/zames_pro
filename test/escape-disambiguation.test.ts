import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor, ESC_DISAMBIGUATE_MS } from '../src/input.ts'

// Regression (N29): a control sequence delivered in two chunks (ESC, then the
// tail) used to look like a lone Escape and aborted the generation. The editor
// now holds a bare ESC briefly and re-attaches a following tail.

const ESC = String.fromCharCode(27)
const LEFT = '[D'

function makeEditor() {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  return e
}

test('ESC split from its tail is parsed as one sequence, not Escape', async () => {
  const e = makeEditor()
  let aborted = 0
  e.onEscape = () => aborted++
  e.buf = 'abc'
  e.cursor = 3

  e._handle(Buffer.from(ESC)) // first chunk: bare ESC
  e._handle(Buffer.from(LEFT)) // second chunk: the rest of the arrow

  // The arrow was applied (cursor moved left) and Escape did NOT fire.
  assert.equal(e.cursor, 2)
  await new Promise((r) => setTimeout(r, ESC_DISAMBIGUATE_MS + 20))
  assert.equal(aborted, 0)
})

test('a genuine lone Escape still aborts after the disambiguation delay', async () => {
  const e = makeEditor()
  let aborted = 0
  e.onEscape = () => aborted++

  e._handle(Buffer.from(ESC))
  assert.equal(aborted, 0, 'not fired synchronously')
  await new Promise((r) => setTimeout(r, ESC_DISAMBIGUATE_MS + 20))
  assert.equal(aborted, 1)
})

const UP = '[A'
test('a split arrow does not abort (Up)', async () => {
  const e = makeEditor()
  let aborted = 0
  e.onEscape = () => aborted++
  e.history = ['old']
  e._histIndex = e.history.length
  e.buf = 'new'
  e.cursor = 3

  e._handle(Buffer.from(ESC))
  e._handle(Buffer.from(UP))
  assert.equal(e.buf, 'old')
  await new Promise((r) => setTimeout(r, ESC_DISAMBIGUATE_MS + 20))
  assert.equal(aborted, 0)
})

const PASTE_START = ESC + '[200~'
const PASTE_END = ESC + '[201~'

test('a PASTE_START split across two chunks is still bracketed', () => {
  const e = makeEditor()
  // First chunk: text plus a PARTIAL start marker (ESC[20).
  e._handle(Buffer.from('hi' + ESC + '[20'))
  // The partial marker must NOT have leaked into the buffer.
  assert.equal(e.buf, 'hi')
  assert.equal(e._ctrlTail, ESC + '[20')
  // Second chunk: the rest of the marker + the pasted body + the end marker.
  const body =
    'line1' +
    String.fromCharCode(10) +
    'line2' +
    String.fromCharCode(10) +
    'line3'
  e._handle(Buffer.from('0~' + body + PASTE_END))
  // The paste was recognized (no marker text leaked) and collapsed/kept aside.
  assert.ok(
    !e.buf.includes('[20'),
    'the partial marker must not leak into the buffer',
  )
  assert.ok(
    !e.buf.includes('[200~'),
    'the start marker must not leak into the buffer',
  )
})
