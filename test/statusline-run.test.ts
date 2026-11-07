import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runStatusLineCommand } from '../src/statusline.ts'

// The statusLine hook runs an operator-supplied command on a timer and shows
// its FIRST line. A spawn is a real subprocess (no live agent involved), so the
// contract pinned here is the one the badge depends on: first line only, a
// trim, the 80-column clip, the JSON on stdin and an empty string on failure.

const INFO = {
  chatId: 'chat-1',
  queueLength: 2,
  tokens: 100,
  contextLimit: 1000,
  tasks: '1/2',
  locale: 'ru',
}

test('only the FIRST stdout line is returned, trimmed', async () => {
  const out = await runStatusLineCommand(
    process.cwd(),
    'printf "first\\nsecond\\n"',
    INFO,
  )
  assert.equal(out, 'first')
})

test('the status object is passed as JSON on stdin', async () => {
  // The JSON is one line longer than the 80-column badge, so the badge shows
  // its PREFIX: the clip is what the status bar actually renders.
  const out = await runStatusLineCommand(process.cwd(), 'head -c 40', INFO)
  assert.equal(out, '{"chatId":"chat-1","queueLength":2,"toke')
})

test('a long line is clipped to 80 columns with an ellipsis', async () => {
  const out = await runStatusLineCommand(
    process.cwd(),
    'printf "%s" "' + 'x'.repeat(200) + '"',
    INFO,
  )
  assert.equal(out.length, 80)
  assert.ok(out.endsWith('…'))
  assert.equal(out.slice(0, -1), 'x'.repeat(79))
})

test('a failing command yields an empty string, not an error', async () => {
  const out = await runStatusLineCommand(process.cwd(), 'exit 3', INFO)
  assert.equal(out, '')
})

test('an empty output yields an empty string', async () => {
  const out = await runStatusLineCommand(process.cwd(), 'true', INFO)
  assert.equal(out, '')
})

test('a command that ignores stdin still returns its line', async () => {
  const out = await runStatusLineCommand(process.cwd(), 'echo ready', INFO)
  assert.equal(out, 'ready')
})

test('leading whitespace of the first line is trimmed', async () => {
  const out = await runStatusLineCommand(
    process.cwd(),
    'printf "   padded   \\n"',
    INFO,
  )
  assert.equal(out, 'padded')
})
