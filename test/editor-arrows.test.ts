import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

const NL = String.fromCharCode(10)
const UP = '\x1b[A'
const DOWN = '\x1b[B'

function makeEditor(): LineEditor {
  const e = new LineEditor()
  // Stub out terminal drawing: these tests only exercise cursor/history logic.
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  return e
}

test('arrows: single-line input goes to history (behavior preserved)', () => {
  const e = makeEditor()
  e.history = ['older']
  e._histIndex = e.history.length
  e.buf = 'current'
  e.cursor = e.buf.length

  // On a single (first == last) line an Up must pull the previous history.
  e._handle(Buffer.from(UP))
  assert.equal(e.buf, 'older')

  // Down returns to the saved draft.
  e._handle(Buffer.from(DOWN))
  assert.equal(e.buf, 'current')
})

test('arrows: inside a multiline buffer move the cursor, not the history', () => {
  const e = makeEditor()
  e.history = ['previous message']
  e._histIndex = e.history.length
  e.buf = 'line1' + NL + 'line2'
  e.cursor = e.buf.length

  // Up from the last line -> end of the first line (no history switch).
  e._handle(Buffer.from(UP))
  assert.equal(e.buf, 'line1' + NL + 'line2', 'text must not change')
  assert.equal(e.cursor, 5)

  // Down from the first line -> back to the last line.
  e._handle(Buffer.from(DOWN))
  assert.equal(e.cursor, e.buf.length)

  // Down again (already on the last line) -> history forward.
  e._histIndex = 0
  e.history = ['h1', 'h2']
  e.buf = 'line1' + NL + 'line2'
  e.cursor = e.buf.length
  e._handle(Buffer.from(DOWN))
  assert.equal(e._histIndex, 1)
})

test('arrows: from the first line of a multiline buffer Up reaches history', () => {
  const e = makeEditor()
  e.history = ['remembered']
  e._histIndex = e.history.length
  e.buf = 'line1' + NL + 'line2'
  e.cursor = 3 // on the first line

  e._handle(Buffer.from(UP))
  assert.equal(e.buf, 'remembered')
})

test('arrows: Up/Down keep the column inside a line', () => {
  const e = makeEditor()
  e.buf = 'abcdef' + NL + 'xy'
  e.cursor = 9 // after 'xy' (column 2 on the second line)

  e._handle(Buffer.from(UP))
  // Column 2 on the first line -> position 2.
  assert.equal(e.cursor, 2)
})
