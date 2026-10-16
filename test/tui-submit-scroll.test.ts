import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TuiEditor } from '../src/tui/TuiEditor.js'

// Submitting a message must PIN the full-screen log back to the newest
// content: the operator may have scrolled up (PgUp / wheel) to read history,
// but sending a message should snap the viewport to the bottom so the message
// and the answer appear in view. This drives handleSubmit() (private) through
// a cast — the editor works without a real terminal here because printAbove
// only mutates the store.

type SubmitCapable = { handleSubmit(display: string, atts: unknown[]): void }

test('submitting snaps the log viewport back to the bottom (scroll = 0)', () => {
  const editor = new TuiEditor({ alternateScreen: true })
  // Simulate the operator having scrolled up.
  editor.store.set({ scroll: 42 })
  assert.equal(editor.store.getSnapshot().scroll, 42)

  ;(editor as unknown as SubmitCapable).handleSubmit('hello', [])

  assert.equal(
    editor.store.getSnapshot().scroll,
    0,
    'scroll must reset to 0 so the new turn is visible',
  )
})

test('submitting is a no-op on scroll when already at the bottom', () => {
  const editor = new TuiEditor({ alternateScreen: true })
  assert.equal(editor.store.getSnapshot().scroll, 0)
  ;(editor as unknown as SubmitCapable).handleSubmit('hi', [])
  assert.equal(editor.store.getSnapshot().scroll, 0)
})
