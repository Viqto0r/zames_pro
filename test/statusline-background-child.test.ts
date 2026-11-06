import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runStatusLineCommand } from '../src/statusline.ts'

// A statusLine command that backgrounds a child (`my-status &`, a watcher) —
// the grandchild INHERITS our stdout pipe and keeps it open. The command's own
// line has already been printed, but the promise stayed pending until the
// whole 4s timeout on EVERY tick: the badge simply stopped updating. The
// comment promises the opposite; the `end`/`close` listeners never fire while
// a background process holds the pipe, because the CHILD (the shell) also
// waits for its own background job when the shell is not detached from it.
// The command must return its line promptly even with a lingering grandchild.

const info = {
  chatId: null,
  queueLength: 0,
  tokens: null,
  contextLimit: 0,
  tasks: '',
  locale: 'ru',
}

test('a backgrounded child does not hold the badge until the timeout', async () => {
  const started = Date.now()
  const out = await runStatusLineCommand(
    '/tmp',
    'echo hi; (sleep 20) &',
    info,
    3000,
  )
  const ms = Date.now() - started
  assert.equal(out, 'hi')
  assert.ok(ms < 1500, 'the badge waited ' + ms + 'ms for a background child')
})
