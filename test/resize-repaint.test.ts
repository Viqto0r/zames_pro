import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// Resize handling: a terminal resize (SIGWINCH / process.stdout resize)
// must repaint the editor block. It must NOT clear the whole viewport
// (ESC[2J): that pushes the history above into the scrollback and leaves a
// blank gap between the footer and the text the operator was reading.
// The block itself is erased with a RELATIVE move (cursor row within the
// block), which still lands on the block top row after a reflow.

test('resize repaints the block', async () => {
  const e = new LineEditor()
  let renders = 0
  e._render = () => {
    renders++
  }
  const handler = (e as unknown as { _onResize: () => void })._onResize
  assert.equal(typeof handler, 'function', 'a resize handler must exist')
  handler()
  await new Promise<void>((resolve) => setTimeout(resolve, 250))
  assert.ok(renders >= 1, 'resize must repaint the block')
  e.dispose()
})

test('resize does NOT clear the whole viewport', () => {
  const e = new LineEditor()
  const writes: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    writes.push(String(s))
    return true
  }
  try {
    ;(e as unknown as { rendered: boolean }).rendered = true
    ;(e as unknown as { _resizeRepin: boolean })._resizeRepin = true
    ;(e as unknown as { _writeBlock: () => void })._writeBlock()
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  assert.ok(
    !writes.some((s) => s.includes('\u001b[2J')),
    'resize must not clear the whole viewport (it hides the history)',
  )
})

test('clearScreen still erases the viewport when called explicitly', () => {
  const e = new LineEditor()
  const writes: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  ;(process.stdout as unknown as { write: (s: string) => boolean }).write = (
    s: string,
  ) => {
    writes.push(String(s))
    return true
  }
  try {
    e.clearScreen()
  } finally {
    ;(process.stdout as unknown as { write: typeof orig }).write = orig
  }
  assert.ok(
    writes.some((s) => s.includes('\u001b[2J')),
    'clearScreen must clear the viewport',
  )
})
