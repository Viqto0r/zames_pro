// A PreToolUse hook that exits non-zero BLOCKS the tool, and its stderr
// becomes the tool result the model reads. Nothing capped that text: a hook
// that dumps a 300 KB log made the whole blob a tool result — a single call
// could flood (and truncate) the context.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runPreToolUse, type HooksConfig } from '../src/hooks.ts'

test('a huge PreToolUse denial is capped', async () => {
  const hooks: HooksConfig = {
    PreToolUse: [{ command: 'yes denial | head -c 300000 1>&2; exit 2' }],
  }
  const reason = await runPreToolUse(hooks, 'Bash', {}, process.cwd())
  assert.ok(reason, 'a denial reason is returned')
  assert.ok(
    reason!.length <= 8000,
    'denial reason must be capped, got ' + reason!.length + ' chars',
  )
  assert.ok(reason!.startsWith('denial'), 'the head of the reason is kept')
})

test('a normal denial is unchanged', async () => {
  const hooks: HooksConfig = {
    PreToolUse: [{ command: 'echo nope >&2; exit 3' }],
  }
  assert.equal(await runPreToolUse(hooks, 'Bash', {}, process.cwd()), 'nope')
})

test('a zero exit allows the call', async () => {
  const hooks: HooksConfig = { PreToolUse: [{ command: 'true' }] }
  assert.equal(await runPreToolUse(hooks, 'Bash', {}, process.cwd()), null)
})
