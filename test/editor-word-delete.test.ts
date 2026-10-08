import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// Ctrl+Backspace / Alt+Backspace delete the word on the LEFT; Ctrl+Delete /
// Alt+Delete delete the word on the RIGHT. These sequences used to fall
// through the generic escape-skip, so nothing happened (the operator pressed
// the key and the line did not change).

const ESC = String.fromCharCode(27)
const DEL = String.fromCharCode(127)

function makeEditor(buf: string, cursor = buf.length): LineEditor {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  e.buf = buf
  e.cursor = cursor
  return e
}

test('Ctrl+Backspace (ESC DEL) deletes the word on the left', () => {
  const e = makeEditor('foo bar baz')
  e._handle(Buffer.from(ESC + DEL))
  assert.equal(e.buf, 'foo bar ')
  assert.equal(e.cursor, 8)
})

test('Ctrl+Delete (ESC [3;5~) deletes the word on the right', () => {
  const e = makeEditor('foo bar baz', 0)
  e._handle(Buffer.from(ESC + '[3;5~'))
  assert.equal(e.buf, ' bar baz')
  assert.equal(e.cursor, 0)
})

test('Alt+Delete (ESC [3;3~) also deletes the word on the right', () => {
  const e = makeEditor('foo bar baz', 4)
  e._handle(Buffer.from(ESC + '[3;3~'))
  assert.equal(e.buf, 'foo  baz')
})

test('kitty-protocol Ctrl+Backspace (CSI 127;5u) deletes the word on the left', () => {
  const e = makeEditor('foo bar baz')
  e._handle(Buffer.from(ESC + '[127;5u'))
  assert.equal(e.buf, 'foo bar ')
})

test('kitty-protocol Ctrl+Delete (CSI 3;5~ / 3;3~) deletes on the right', () => {
  const e = makeEditor('foo bar baz', 0)
  e._handle(Buffer.from(ESC + '[3;5~'))
  assert.equal(e.buf, ' bar baz')
})

test('kitty-protocol Ctrl+Delete without tilde (CSI 3;5u) deletes the word on the right', () => {
  const e = makeEditor('foo bar baz', 0)
  e._handle(Buffer.from(ESC + '[3;5u'))
  assert.equal(e.buf, ' bar baz')
})

test('kitty-protocol Alt+Delete (CSI 3;3u) deletes the word on the right', () => {
  const e = makeEditor('foo bar baz', 4)
  e._handle(Buffer.from(ESC + '[3;3u'))
  assert.equal(e.buf, 'foo  baz')
})

test('kitty-protocol plain Delete (CSI 3u) deletes one char', () => {
  const e = makeEditor('abc', 1)
  e._handle(Buffer.from(ESC + '[3u'))
  assert.equal(e.buf, 'ac')
})

test('word deletion does not cross the cursor into the other side', () => {
  const e = makeEditor('foo bar', 0)
  // Ctrl+Backspace at column 0 must be a no-op.
  e._handle(Buffer.from(ESC + DEL))
  assert.equal(e.buf, 'foo bar')
  // Ctrl+Delete at end of line must be a no-op.
  e.cursor = e.buf.length
  e._handle(Buffer.from(ESC + '[3;5~'))
  assert.equal(e.buf, 'foo bar')
})
