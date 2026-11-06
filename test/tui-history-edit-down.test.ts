import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  insertText,
  historyUp,
  historyDown,
} from '../src/tui/edit.ts'

// Editing a RECALLED history entry and then pressing Down must move to the
// NEXT entry (the edit is a scratch copy of THIS slot, not the operator's
// draft). Returning the remembered draft instead DROPPED the edit and jumped
// out of history — the operator lost the line they were fixing.

test('Down after editing a recalled entry shows the next entry, not the draft', () => {
  let s = { ...initialEditState(), history: ['x', 'y', 'z'], histIndex: 3 }
  s = insertText(s, 'my draft')
  // Up twice: 'z', then 'y'.
  const up2 = historyUp(historyUp(s))
  assert.equal(up2.buf, 'y')
  const edited = insertText(up2, '!')
  assert.equal(edited.buf, 'y!')
  const down = historyDown(edited)
  // Still INSIDE the history, showing the NEXT entry.
  assert.equal(down.histIndex, 2, 'jumped out of the history')
  assert.equal(down.buf, 'z')
})
