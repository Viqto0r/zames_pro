import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  insertText,
  historyUp,
  historyDown,
  rememberDraft,
  browsingHistory,
} from '../src/tui/edit.ts'

// A real report: the operator was editing a message, pressed Up by accident,
// went into the history and could not get the typed text back — it was gone.
// The draft is now written on every EDIT and never overwritten by a recall.

function draftOf(history: string[], typed: string) {
  let s = { ...initialEditState(), history, histIndex: history.length }
  for (const ch of typed) s = rememberDraft(insertText(s, ch))
  return s
}

test('a typed line survives one accidental Up and comes back on Down', () => {
  let s = draftOf(['one', 'two'], 'hello')
  s = historyUp(s)
  assert.equal(s.buf, 'two')
  assert.ok(browsingHistory(s))
  s = historyDown(s)
  assert.equal(s.buf, 'hello', 'the unsent text was lost')
  assert.ok(!browsingHistory(s))
})

test('a second Up after Down does not overwrite the draft', () => {
  let s = draftOf(['one', 'two'], 'hello')
  s = historyUp(s)
  s = historyDown(s)
  s = historyUp(s)
  s = historyUp(s)
  s = historyDown(s)
  s = historyDown(s)
  assert.equal(s.buf, 'hello')
})

test('an EDIT while browsing becomes the new draft', () => {
  let s = draftOf(['one', 'two'], 'hello')
  s = historyUp(s)
  // The operator edits the RECALLED line: that is a new draft, not the old one.
  s = rememberDraft(insertText(s, '!'))
  s = historyDown(s)
  assert.equal(s.buf, 'two!')
})

test('historyDown with nothing to restore keeps the line', () => {
  const s = { ...initialEditState(), history: ['x'], histIndex: 1 }
  assert.equal(historyDown(s).buf, '')
  let t = draftOf(['x'], 'keep')
  t = historyUp(t)
  t = historyDown(t)
  t = historyDown(t)
  assert.equal(t.buf, 'keep')
})
