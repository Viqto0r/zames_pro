// recordHistory() stores the submitted message for Up-arrow recall. The buffer
// may hold a collapsed paste marker `[Pasted lines#N]` (the body lives in the
// paste list and is expanded by the adapter; `afterSubmit` then CLEARS that
// list). A marker stored as-is is recalled later with no body to expand, and
// the literal marker is sent to the model. The caller passes the EXPANDED
// message, and recordHistory must store exactly that text.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialEditState, recordHistory } from '../src/tui/edit.ts'

test('recordHistory stores the expanded message it is given', () => {
  const s = recordHistory(initialEditState(), 'line1\nline2\nline3')
  assert.deepEqual(s.history, ['line1\nline2\nline3'])
})

test('an empty message is not recorded', () => {
  const s = recordHistory(initialEditState(), '   ')
  assert.deepEqual(s.history, [])
})
