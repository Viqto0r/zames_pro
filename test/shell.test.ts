import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
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

test('startBackground/pollBackground/killBackground lifecycle', async () => {
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

test('assertCommandInsideRoot blocks a cd with an unverifiable target', () => {
  const root = process.cwd()
  // A variable that is NOT $HOME cannot be resolved statically, so it is
  // refused instead of silently resolving to root/$d.
  assert.throws(
    () => assertCommandInsideRoot(root, 'd=/; cd $d'),
    /cannot verify cd target/,
  )
  assert.throws(
    () => assertCommandInsideRoot(root, 'cd `echo /`'),
    /cannot verify cd target/,
  )
  // ~user (another user's home) is also unverifiable.
  assert.throws(
    () => assertCommandInsideRoot(root, 'cd ~root'),
    /cannot verify cd target/,
  )
  // $HOME IS expanded and checked: it points outside this project, so it is
  // blocked for LEAVING (not for being unverifiable).
  assert.throws(
    () => assertCommandInsideRoot(root, 'cd $HOME && ls'),
    /leaving/,
  )
  // A $HOME-relative path that stays inside the root is allowed.
  const inside = '$HOME/' + path.relative(os.homedir(), root)
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'cd ' + inside))
})

// The background buffer is trimmed to the last BG_MAX_BUFFER UTF-16 units on
// every chunk. A cut between the halves of a surrogate pair (an emoji or an
// astral CJK char) leaves a LONE LOW SURROGATE at the head of the buffer that
// pollBackground returns to the model as a tool result.
// killBackground() sent SIGTERM and immediately FORGOT the id. A shell that
// traps TERM (`trap '' TERM`) ignored it, and the operator was told "Killed"
// while the process kept running as an orphan. Verify the SIGKILL escalation
// actually removes the process group.
test('killBackground escalates to SIGKILL when SIGTERM is trapped', async () => {
  const { startBackground, killBackground } = await import('../src/shell.ts')
  const id = startBackground(process.cwd(), "trap '' TERM; sleep 30")
  const msg = killBackground(id)
  assert.match(msg, /Killed background process/)
  // Wait out the 1.5s grace period, then look for a surviving `sleep 30`
  // child (ps is the portable probe).
  await new Promise((r) => setTimeout(r, 2500))
  const { execFileSync } = await import('node:child_process')
  const ps = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf-8' })
  const survivors = ps
    .split(String.fromCharCode(10))
    .filter((l) => l.includes('sleep 30') && !l.includes('ps -eo'))
  assert.equal(survivors.length, 0, 'orphan left: ' + survivors.join(' | '))
})

test('a background trim never starts on a lone low surrogate', async () => {
  const { startBackground, pollBackground, killBackground } =
    await import('../src/shell.ts')
  // ~1.1M UTF-16 units with an odd prefix: the front cut lands on the LOW
  // half of a surrogate pair (verified: the kept window starts with de00).
  const id = startBackground(
    process.cwd(),
    "node -e \"process.stdout.write('a'.repeat(4990) + String.fromCharCode(55357,56832).repeat(524290) + 'x')\"",
  )
  try {
    let out = ''
    for (let k = 0; k < 12; k++) {
      await new Promise((r) => setTimeout(r, 400))
      out = pollBackground(id)
      if (out.length >= 1_000_000) break
    }
    const marker = '[...earlier output trimmed]'
    const m = out.indexOf(marker)
    assert.ok(m >= 0, 'the buffer should have been trimmed')
    const head = out.charCodeAt(m + marker.length + 1)
    assert.ok(
      !(head >= 0xdc00 && head <= 0xdfff),
      'kept window starts with a lone low surrogate: ' + head.toString(16),
    )
  } finally {
    killBackground(id)
  }
})
