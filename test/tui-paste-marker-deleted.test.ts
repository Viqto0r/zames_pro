// A large paste collapses to a `[Pasted lines#N]` marker in the buffer while
// its body lives in the paste list. When the operator DELETES that marker by
// hand and then pastes NEW text with the same line count, the old body stayed
// in the list: `expandPastes` saw one marker for one body and sent the
// DELETED text to the model instead of the new one — the operator's message
// silently contained someone else's content.
//
// The deletion must drop the block from the paste list, exactly like a cleared
// line already does.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  insertPaste,
  backspace,
  del,
} from '../src/tui/edit.ts'
import { expandPastes } from '../src/input/layout.ts'

const NL = String.fromCharCode(10)
const OLD = 'old1' + NL + 'old2' + NL + 'old3'
const NEW = 'new1' + NL + 'new2' + NL + 'new3'

function deleteAll(
  s: ReturnType<typeof initialEditState>,
  key: (
    st: ReturnType<typeof initialEditState>,
  ) => ReturnType<typeof initialEditState>,
) {
  // The length SHRINKS on every key, so the bound is taken once.
  const n = Array.from(s.buf).length
  let cur = s
  for (let i = 0; i < n + 1; i++) cur = key(cur)
  return cur
}

test('deleting a paste marker with Backspace drops its body', () => {
  const s = deleteAll(insertPaste(initialEditState(), OLD), backspace)
  assert.equal(s.buf, '')
  assert.equal(s.pastes.length, 0, 'the deleted paste is still in the list')
})

test('a fresh paste after a deleted one is sent, not the old body', () => {
  const cleared = deleteAll(insertPaste(initialEditState(), OLD), backspace)
  const s = insertPaste(cleared, NEW)
  assert.equal(expandPastes(s.pastes, s.buf), NEW)
})

test('deleting the marker forward with Delete also drops the body', () => {
  // `del` removes the char AFTER the cursor; the caret sits at the END of the
  // inserted marker, so it must be moved to the start first.
  const pasted = insertPaste(initialEditState(), OLD)
  const s = deleteAll({ ...pasted, cursor: 0 }, del)
  assert.equal(s.buf, '')
  assert.equal(s.pastes.length, 0, 'the deleted paste is still in the list')
})
