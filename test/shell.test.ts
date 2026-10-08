import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { assertCommandInsideRoot, runShell } from '../src/shell.ts'

// The `!command` operator escape and the Bash tool share this module, so the
// sandbox guard and the runner are tested once here.

const ROOT = process.cwd()

test('assertCommandInsideRoot allows a command inside the root', () => {
  assert.doesNotThrow(() => assertCommandInsideRoot(ROOT, 'ls -la'))
  assert.doesNotThrow(() => assertCommandInsideRoot(ROOT, 'git status'))
  assert.doesNotThrow(() => assertCommandInsideRoot(ROOT, 'cd sub && ls'))
})

test('assertCommandInsideRoot blocks cd/pushd leaving the root', () => {
  assert.throws(
    () => assertCommandInsideRoot(ROOT, 'cd /etc && ls'),
    /Sandbox: leaving/,
  )
  assert.throws(
    () => assertCommandInsideRoot(ROOT, 'cd .. && ls'),
    /Sandbox: leaving/,
  )
  assert.throws(
    () => assertCommandInsideRoot(ROOT, 'pushd ../..'),
    /Sandbox: leaving/,
  )
})

test('runShell returns stdout and an exit code on failure', async () => {
  const ok = await runShell(ROOT, 'echo hello')
  assert.equal(ok, 'hello')

  const fail = await runShell(ROOT, 'exit 3')
  assert.match(fail, /Exit code: 3/)
})

test('startBackground/pollBackground/killBackground lifecycle (N33)', async () => {
  const { startBackground, pollBackground, killBackground } =
    await import('../src/shell.ts')
  const id = startBackground(process.cwd(), 'echo hello-bg && sleep 30')
  assert.ok(/^[0-9a-f]{6}$/.test(id), id)
  // Give the process a moment to emit its output.
  await new Promise((r) => setTimeout(r, 400))
  const out = pollBackground(id)
  assert.ok(out.includes('hello-bg'), out)
  const killed = killBackground(id)
  assert.ok(killed.includes(id), killed)
  // A second kill reports it is gone / already exited.
  const again = pollBackground(id)
  assert.ok(again.includes('No background process'), again)
})

test('pollBackground on an unknown id is a clear message, not a throw', async () => {
  const { pollBackground } = await import('../src/shell.ts')
  assert.ok(pollBackground('zzzzzz').includes('No background process'))
})
