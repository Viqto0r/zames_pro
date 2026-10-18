// The statusLine hook runs `ui.statusLineCommand` on a TIMER while the
// operator types. Its stdout is accumulated into ONE string with no cap: a
// command that prints a big blob (a JSON dump, `ls -R`, a build log) made
// `out` grow unboundedly, and the status line then rendered megabytes into the
// input row on every repaint -- the terminal turned unusable.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runStatusLineCommand } from '../src/statusline.ts'

const INFO = {
  chatId: null,
  queueLength: 0,
  tokens: null,
  contextLimit: 1_000_000,
  tasks: '',
  locale: 'en',
}

test('a huge statusLine output is capped, not accumulated in full', async () => {
  const cmd = 'head -c 500000 /dev/zero | tr "\\0" "x"; echo'
  const out = await runStatusLineCommand(process.cwd(), cmd, INFO, 5000)
  assert.ok(out.length > 0, 'should still return a line')
  assert.ok(
    out.length <= 1000,
    'a status line must be a short badge, got ' + out.length + ' chars',
  )
})

test('a normal statusLine command is unchanged', async () => {
  const out = await runStatusLineCommand(
    process.cwd(),
    'printf "branch: main"',
    INFO,
    2000,
  )
  assert.equal(out, 'branch: main')
})

// The hook runs on a TIMER, once per tick, and `tick()` awaits it. The promise
// settled only on 'close' (or the timeout) -- but 'close' waits for the stdio
// PIPES, not just the process: a backgrounded daemon (`npm run dev &`, a
// watcher) keeps the pipe open in a grandchild, so every tick blocked the full
// timeout although the line was already printed.
test('statusLine settles when its OWN stdout closes, not at the timeout', async () => {
  const started = Date.now()
  // The shell prints the line, closes its OWN stdout and then stays alive
  // (1s, so the old code decides on its own): a real command that kept the
  // pipe open forever made the test hung after the assertion.
  const out = await runStatusLineCommand(
    process.cwd(),
    'printf "branch: dev\\n"; exec 1>&- ; sleep 1',
    INFO,
    4000,
  )
  const ms = Date.now() - started
  assert.equal(out, 'branch: dev')
  // The fix settles on the pipe end (milliseconds); the old code waited for
  // the process to exit (about 1s) or for the 4s
  // timeout.
  assert.ok(ms < 800, 'should not wait for timeout, got ' + ms + 'ms')
})
