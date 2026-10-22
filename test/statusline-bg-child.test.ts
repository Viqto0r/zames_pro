import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runStatusLineCommand } from '../src/statusline.ts'

// A statusLine command that leaves a BACKGROUND child holding the pipe (a
// watcher, `npm run dev &`) kept the promise pending: the timer kills the
// SHELL, but the grandchild inherits the stdout pipe, so the 'close' event
// never fires and the status line stops updating on every tick.
const info = {
  chatId: null,
  queueLength: 0,
  tokens: null,
  contextLimit: 1000,
  tasks: '',
  locale: 'en',
}

test('a background child cannot keep the statusLine pending', async () => {
  const t0 = Date.now()
  const out = await runStatusLineCommand(
    process.cwd(),
    'echo quick; sleep 30 &',
    info,
    400,
  )
  const elapsed = Date.now() - t0
  assert.equal(out, 'quick')
  assert.ok(elapsed < 3000, 'the promise waited for the background child')
})
