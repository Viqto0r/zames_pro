import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runStatusLineCommand } from '../src/statusline.ts'

// The status line is rendered as ONE row. A command that prints a long single
// line is buffered up to MAX_OUT (400 chars) and returned WHOLE — 400 columns
// of raw text in a status row, which no terminal can show and which the UI
// renders unwrapped (the row overflows / wraps and the cursor arithmetic
// drifts). The value that reaches the editor must stay short.
const info = {
  chatId: null,
  queueLength: 0,
  tokens: null,
  contextLimit: 1000000,
  tasks: '',
  locale: 'ru',
}

test('a long status line is clipped before it reaches the UI', async () => {
  const line = await runStatusLineCommand(
    '/tmp',
    'node -e \'process.stdout.write("z".repeat(2000))\'',
    info,
    4000,
  )
  assert.ok(line.length > 0, 'the line must reach the caller')
  assert.ok(
    line.length <= 120,
    'a status badge must stay short, got ' + line.length + ' chars',
  )
})
