// hooks run with the tool call exported as ZAMES_TOOL_ARGS / ZAMES_TOOL_RESULT
// ENV vars. A Write/Edit carries the whole file in `content`, which easily
// exceeds the OS per-variable limit (~128 KB on Linux): the hook then cannot be
// spawned at all. For a PostToolUse hook that is a silent loss; for a
// PreToolUse GUARD (`exit 0`, i.e. "allow") the failure is treated as a
// DENIAL, so a legitimate Write of a big file is blocked by the hook that was
// meant to permit it. The stdin payload already carries the full call, so the
// env copy only needs to be short.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runPreToolUse, runPostToolUse } from '../src/hooks.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

test('a PreToolUse guard still allows a big Write', async (t) => {
  const dir = makeTmpDirSync(t, 'zames-hooks-big-')
  const hooks = { PreToolUse: [{ command: 'exit 0' }] }
  const args = { path: 'a.ts', content: 'z'.repeat(300_000) }
  const r = await runPreToolUse(hooks as never, 'Write', args, dir)
  assert.equal(r, null, 'a permit hook blocked the call: ' + JSON.stringify(r))
})

test('a PostToolUse hook still runs on a big result', async (t) => {
  const dir = makeTmpDirSync(t, 'zames-hooks-big2-')
  const hooks = { PostToolUse: [{ command: 'echo seen' }] }
  const out = await runPostToolUse(
    hooks as never,
    'Bash',
    {},
    'y'.repeat(300_000),
    dir,
  )
  assert.equal(out, 'seen')
})
