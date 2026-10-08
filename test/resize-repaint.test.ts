import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// Resize handling: a terminal resize (SIGWINCH / process.stdout 'resize') must
// repaint the editor block from a CLEAN viewport. After a resize the terminal
// re-flows the lines above the block, so the relative ESC[n A erase lands on a
// stale row and the old block would be left on screen as a duplicate. The
// repaint clears the VIEWPORT with ESC[2J (clears the screen, not the
// scrollback, so the history above is preserved).

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

test('resize repaints from a clean viewport (ESC[2J is emitted)', () => {
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
    writes.some((s) => s.includes('\u001b[2J')),
    'resize must clear the viewport',
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
