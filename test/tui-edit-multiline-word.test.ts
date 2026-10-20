// Ctrl+W / Alt+Backspace at the START of a line used to eat the NEWLINE and
// then the previous line's last word: `deleteWordLeft` treated a newline as
// ordinary whitespace, so the line break (and the text before it) vanished
// instead of the key doing nothing at the line start. `deleteWordRight` and
// `wordLeft` already stop at a newline; the left-side helpers must too.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  insertText,
  deleteWordLeft,
  wordLeft,
} from '../src/tui/edit.ts'

const NL = String.fromCharCode(10)

function state(text: string, cursor: number) {
  const s = insertText(initialEditState(), text)
  return { ...s, cursor }
}

test('deleteWordLeft at a line start does not eat the newline', () => {
  const s = state('ab' + NL + 'cd', 3) // right after the newline
  const out = deleteWordLeft(s)
  assert.equal(out.buf, 'ab' + NL + 'cd')
  assert.equal(out.cursor, 3)
})

test('deleteWordLeft at the end of a line deletes that line word', () => {
  const s = state('ab' + NL + 'cd', 5)
  const out = deleteWordLeft(s)
  assert.equal(out.buf, 'ab' + NL)
})

test('wordLeft at a line start stays on the line', () => {
  const s = state('ab' + NL + 'cd', 3)
  assert.equal(wordLeft(s).cursor, 3)
})
