// The legacy LineEditor (used when `ui.tui` is off, or on a terminal where
// Ink cannot run) has its own word operations: `_wordLeft`, `_wordRight`,
// `_deleteWordLeft`, `_deleteWordRight`. Unlike the TUI's pure `edit.ts`
// versions, they stop only at WHITESPACE, so Ctrl+W / Alt+B / Ctrl+← in a
// multiline message swallowed the newline and jumped to the PREVIOUS line's
// word (or deleted across the line break). The TUI already treats a newline as
// a hard boundary — the two engines must behave the same.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const NL = String.fromCharCode(10)

// The module is a class with private-ish methods; drive them through a minimal
// instance the same way the editor does (fields are plain properties).
interface WordEditor {
  buf: string
  cursor: number
  _wordLeft(): void
  _wordRight(): void
  _deleteWordLeft(): void
  _deleteWordRight(): void
}

async function makeEditor(buf: string, cursor: number): Promise<WordEditor> {
  const mod = await import('../src/input.ts')
  const proto = (mod.LineEditor as unknown as { prototype: WordEditor })
    .prototype
  const ed = Object.create(proto) as WordEditor
  ed.buf = buf
  ed.cursor = cursor
  return ed
}

test('wordLeft does not cross a newline', async () => {
  const ed = await makeEditor('first line' + NL + 'second', 16)
  ed._wordLeft()
  // Must land at the START of `second` (index 11), not at `line`'s start.
  assert.equal(ed.cursor, 11, 'cursor ' + ed.cursor)
})

test('wordRight does not cross a newline', async () => {
  const ed = await makeEditor('first' + NL + 'second', 5)
  ed._wordRight()
  assert.equal(ed.cursor, 5, 'cursor ' + ed.cursor)
})

test('deleteWordLeft does not eat the newline', async () => {
  // The caret sits at the START of `second`: deleting the word to the left
  // must do NOTHING (the newline is a boundary), not eat into `first`.
  const ed = await makeEditor('first' + NL + 'second', 6)
  ed._deleteWordLeft()
  assert.equal(ed.buf, 'first' + NL + 'second', JSON.stringify(ed.buf))
  // Inside the second word it deletes only that word's head.
  const ed2 = await makeEditor('first' + NL + 'second', 9)
  ed2._deleteWordLeft()
  assert.equal(ed2.buf, 'first' + NL + 'ond', JSON.stringify(ed2.buf))
})

test('deleteWordRight stops at the newline', async () => {
  const ed = await makeEditor('first' + NL + 'second', 2)
  ed._deleteWordRight()
  assert.equal(ed.buf, 'fi' + NL + 'second', JSON.stringify(ed.buf))
})
