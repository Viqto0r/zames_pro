import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialEditState,
  insertPaste,
  pushUndo,
  undoEdit,
  backspace,
} from '../src/tui/edit.ts'
import { expandPastes } from '../src/input/layout.ts'

// A large paste collapses to a `[Pasted lines#N]` marker and its body is kept
// in `pastes`; expandPastes() restores it at submit. Ctrl+U (clearLine) drops
// the line AND the paste blocks; Ctrl+_ (undoEdit) is the documented way to
// get it back. The undo snapshot only stored {buf, cursor}, so undo restored
// the bare MARKER while the paste BODY stayed gone - the message then submitted
// the literal marker text and the model never saw the pasted content.
function withBigPaste() {
  return insertPaste(initialEditState(), 'line1\nline2\nline3')
}

test('undo restores the paste BODY after Ctrl+U cleared it', () => {
  const s = pushUndo(withBigPaste())
  const cleared = { ...s, buf: '', cursor: 0, pastes: [] }
  const undone = undoEdit(cleared)
  assert.equal(undone.buf, '[Pasted lines#3]')
  assert.equal(undone.pastes.length, 1, 'the paste block must come back')
  assert.equal(expandPastes(undone.pastes, undone.buf), 'line1\nline2\nline3')
})

test('backspace over the marker then undo also restores its body', () => {
  const s = pushUndo(withBigPaste())
  const afterDel = backspace(pushUndo(s))
  assert.ok(!afterDel.buf.includes('[Pasted lines#3]'), 'marker deleted')
  const undone = undoEdit(afterDel)
  assert.equal(undone.pastes.length, 1)
  assert.equal(expandPastes(undone.pastes, undone.buf), 'line1\nline2\nline3')
})
