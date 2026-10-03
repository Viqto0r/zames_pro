import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

function makeEditor(): LineEditor {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  return e
}

const CTRL_U = String.fromCharCode(21)
const CTRL__ = String.fromCharCode(31)

test('ctrl+u is undoable with ctrl+_', () => {
  const e = makeEditor()
  e.buf = 'important text'
  e.cursor = e.buf.length
  e._handle(Buffer.from(CTRL_U))
  assert.equal(e.buf, '')
  e._handle(Buffer.from(CTRL__))
  assert.equal(e.buf, 'important text')
})

test('ctrl+_ undoes a whole typing run', () => {
  const e = makeEditor()
  e._handle(Buffer.from('hello'))
  assert.equal(e.buf, 'hello')
  e._handle(Buffer.from(CTRL__))
  assert.equal(e.buf, '')
})

test('ctrl+_ on an empty undo stack does nothing', () => {
  const e = makeEditor()
  e.buf = 'x'
  e._handle(Buffer.from(CTRL__))
  assert.equal(e.buf, 'x')
})
