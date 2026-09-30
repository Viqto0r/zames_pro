import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'

// Resize handling: a terminal resize (SIGWINCH / process.stdout 'resize') must
// repaint the editor block, otherwise the old layout (drawn for the previous
// width) stays on screen and artifacts/duplicated text appear.

test('LineEditor wires a resize handler that repaints', async () => {
  const e = new LineEditor()
  let cleared = 0
  e.clearScreen = () => {
    cleared++
  }
  const handler = (e as unknown as { _onResize: () => void })._onResize
  assert.equal(typeof handler, 'function', 'a resize handler must exist')
  handler()
  await new Promise<void>((resolve) => setTimeout(resolve, 250))
  assert.ok(cleared >= 1, 'resize must trigger a full repaint')
  e.dispose()
})

test('clearScreen erases the viewport and repaints', () => {
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
