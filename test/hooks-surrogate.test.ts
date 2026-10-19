// A PreToolUse denial and a PostToolUse/lifecycle notice are cut by a RAW
// character offset. A hook that prints emoji/CJK text can put a surrogate pair
// exactly on the cut: the model then receives a lone high surrogate — a broken
// code point (same rule as truncateToolResult / capReport / summarizeDiagnostics).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runPreToolUse,
  runLifecycleHooks,
  type HooksConfig,
} from '../src/hooks.ts'

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i++
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true
    }
  }
  return false
}

test('a denial cut inside an emoji does not leave a lone surrogate', async () => {
  const cmd =
    'node -e \'process.stdout.write("x" + "\\u{1F600}".repeat(9000)); process.exit(2)\''
  const hooks: HooksConfig = { PreToolUse: [{ command: cmd }] }
  const reason = await runPreToolUse(hooks, 'Bash', {}, process.cwd())
  assert.ok(reason)
  assert.equal(hasLoneSurrogate(reason!), false, 'a lone surrogate leaked')
})

test('a lifecycle notice cut inside an emoji does not leave a lone surrogate', async () => {
  const cmd =
    'node -e \'process.stdout.write("x" + "\\u{1F600}".repeat(9000))\''
  const hooks: HooksConfig = { SessionStart: [{ command: cmd }] }
  const out = await runLifecycleHooks(hooks, 'SessionStart', process.cwd())
  assert.ok(out.length > 0)
  assert.equal(hasLoneSurrogate(out), false, 'a lone surrogate leaked')
})
