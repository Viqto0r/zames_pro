import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// Resize handling: a terminal resize (SIGWINCH / process.stdout 'resize') must
// repaint the editor block, otherwise the old layout (drawn for the previous
// width) stays on screen and artifacts/duplicated text appear. It must NOT
// clear the whole viewport: the tool-call lines and answers printed above the
// input have to stay on screen.

test('resize triggers a block repaint (not a full-screen clear)', async () => {
  const e = new LineEditor()
  let renders = 0
  e._render = () => {
    renders++
  }
  let clears = 0
  e.clearScreen = () => {
    clears++
  }
  const handler = (e as unknown as { _onResize: () => void })._onResize
  assert.equal(typeof handler, 'function', 'a resize handler must exist')
  handler()
  await new Promise<void>((resolve) => setTimeout(resolve, 250))
  assert.ok(renders >= 1, 'resize must repaint the block')
  assert.equal(clears, 0, 'resize must NOT clear the whole screen (history)')
  e.dispose()
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
  const out = writes.join('')
  assert.ok(out.includes('\u001b[2J'), 'clearScreen must clear the viewport')
})
