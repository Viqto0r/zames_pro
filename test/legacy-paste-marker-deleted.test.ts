// The legacy LineEditor (used when `ui.tui` is false) collapses a large paste
// into a `[Pasted lines#N]` marker with the body kept in `this.pastes`.
// Deleting the marker by hand did NOT drop the body, so the next paste of the
// same line count was expanded to the DELETED text — the bug already fixed
// in the TUI editor (src/tui/edit.ts). Both editors must behave alike.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'
import { expandPastes } from '../src/input/layout.ts'

const NL = String.fromCharCode(10)
const OLD = 'old1' + NL + 'old2' + NL + 'old3'
const NEW = 'new1' + NL + 'new2' + NL + 'new3'

function editorWithPaste(raw: string): LineEditor {
  const ed = new LineEditor({ prompt: '> ', commands: [], locale: 'en' })
  ed._insertFallback(raw)
  return ed
}

test('legacy editor: deleting the marker forgets its body', () => {
  const ed = editorWithPaste(OLD)
  const n = Array.from(ed.buf).length
  for (let i = 0; i < n + 1; i++) ed._backspace()
  assert.equal(ed.buf, '')
  assert.equal(ed.pastes.length, 0, 'the deleted paste is still in the list')
})

test('legacy editor: a fresh paste is sent, not the deleted body', () => {
  const ed = editorWithPaste(OLD)
  const n = Array.from(ed.buf).length
  for (let i = 0; i < n + 1; i++) ed._backspace()
  ed._insertFallback(NEW)
  assert.equal(expandPastes(ed.pastes, ed.buf), NEW)
})
