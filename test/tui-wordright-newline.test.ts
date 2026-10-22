// wordRight() treated a NEWLINE as ordinary whitespace: with the cursor at the
// END of a line it skipped the line break and landed at the end of the NEXT
// line, so Alt+F / Ctrl+Right jumped the caret ACROSS a line (the left-side
// helpers already stop at a newline; the right-side one must too).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialEditState, insertText, wordRight } from '../src/tui/edit.ts'

const NL = String.fromCharCode(10)

function state(text: string, cursor: number) {
  const s = insertText(initialEditState(), text)
  return { ...s, cursor }
}

test('wordRight at a line end does not cross the newline', () => {
  const s = state('ab' + NL + 'cd', 2)
  assert.equal(wordRight(s).cursor, 2)
})

test('wordRight inside a line still reaches the end of that word', () => {
  const s = state('ab' + NL + 'cd', 1)
  assert.equal(wordRight(s).cursor, 2)
})

test('wordRight on the LAST line still works', () => {
  const s = state('ab' + NL + 'cd ef', 3)
  assert.equal(wordRight(s).cursor, 5)
})
