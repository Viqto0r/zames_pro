import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDoctor } from '../src/commands.ts'

// renderDoctor is the /doctor TABLE. test/doctor-rows.test.ts pins the
// provider/swallowed/ui rows and the diagnostics gate; this file pins the ROWS
// that were never exercised: the conditional ones (git remote, send pause,
// display, session, headless, context, tokens) and the VALUE SANITIZER that
// keeps one row on one line.

const NL = String.fromCharCode(10)

function base(over: Record<string, unknown> = {}): never {
  return {
    nodeVersion: 'v24',
    platform: 'linux',
    workdir: '/p',
    gitOk: true,
    configOk: true,
    mcpServers: 0,
    mcpTools: 0,
    transcriptOk: true,
    ...over,
  } as never
}

function line(out: string, label: string): string {
  const found = out.split(NL).find((l) => l.includes(' ' + label + ' '))
  assert.ok(found, 'no ' + label + ' row in:' + NL + out)
  return found
}

test('the git remote row appears only with a repo and says which case', () => {
  const none = renderDoctor(base({ hasOrigin: false }))
  assert.match(line(none, 'git remote'), /\[OK\].*no origin/)
  const some = renderDoctor(base({ hasOrigin: true }))
  assert.match(line(some, 'git remote'), /\[OK\].*origin configured/)
  // Without `hasOrigin` the row is not rendered at all.
  assert.ok(!renderDoctor(base()).includes('git remote'))
  // A broken repo never shows a remote row, even with hasOrigin=true.
  const broken = renderDoctor(base({ gitOk: false, hasOrigin: true }))
  assert.ok(!broken.includes('git remote'))
})

test('the send-pause row treats 0 ms as OK only for an adaptive throttle', () => {
  const zero = renderDoctor(base({ minSendIntervalMs: 0 }))
  assert.match(line(zero, 'send pause'), /\[WARN\]/)
  assert.match(line(zero, 'send pause'), /0s between agent sends/)
  const adaptive = renderDoctor(
    base({ minSendIntervalMs: 0, adaptiveThrottle: true }),
  )
  assert.match(line(adaptive, 'send pause'), /\[OK\]/)
  assert.match(
    line(adaptive, 'send pause'),
    /adaptive pause, current interval 0s/,
  )
  // A positive gap is OK either way, and the SECONDS are rounded.
  const pos = renderDoctor(base({ minSendIntervalMs: 15500 }))
  assert.match(line(pos, 'send pause'), /\[OK\]/)
  assert.match(line(pos, 'send pause'), /16s between agent sends/)
  // No number -> no row.
  assert.ok(!renderDoctor(base()).includes('send pause'))
})

test('display and session rows are driven by their booleans', () => {
  const on = renderDoctor(base({ displayAvailable: true }))
  assert.match(line(on, 'display'), /\[OK\].*on/)
  const off = renderDoctor(base({ displayAvailable: false }))
  assert.match(line(off, 'display'), /\[WARN\].*off/)
  const ssh = renderDoctor(base({ sshRemote: true }))
  assert.match(line(ssh, 'session'), /\[OK\].*SSH remote/)
  const local = renderDoctor(base({ sshRemote: false }))
  assert.match(line(local, 'session'), /\[OK\].*local terminal/)
  // Both are omitted when the caller did not probe them.
  const none = renderDoctor(base())
  assert.ok(!none.includes('display'))
  assert.ok(!none.includes('session'))
})

test('the headless row warns when the UA is not cached yet', () => {
  const cached = renderDoctor(base({ headless: true, headlessUaCached: true }))
  assert.match(line(cached, 'headless'), /\[OK\].*UA cached/)
  const cold = renderDoctor(base({ headless: true }))
  assert.match(line(cold, 'headless'), /\[WARN\].*no cached UA yet/)
  // A visible run has no headless row.
  assert.ok(!renderDoctor(base()).includes('headless'))
})

test('the prompt row reports the size, the context and the budget', () => {
  const under = renderDoctor(base({ systemPromptBytes: 2048 }))
  assert.match(line(under, 'prompt'), /\[OK\].*2\.0 KB \(budget 23\.4 KB\)/)
  // An explicit budget wins over the default constant.
  const custom = renderDoctor(
    base({ systemPromptBytes: 2048, systemPromptBudget: 1024 }),
  )
  assert.match(line(custom, 'prompt'), /\[WARN\].*2\.0 KB > 1\.0 KB budget/)
  // The CONTEXT size is appended only when it is positive.
  const ctx = renderDoctor(
    base({ systemPromptBytes: 1024, contextBytes: 4096 }),
  )
  assert.match(line(ctx, 'prompt'), /1\.0 KB \+ 4\.0 KB context/)
  const zeroCtx = renderDoctor(
    base({ systemPromptBytes: 1024, contextBytes: 0 }),
  )
  assert.ok(!zeroCtx.includes('context'))
  // Exactly AT the budget is still OK (the check is strictly greater).
  const at = renderDoctor(
    base({ systemPromptBytes: 1024, systemPromptBudget: 1024 }),
  )
  assert.match(line(at, 'prompt'), /\[OK\]/)
})

test('the context row shows the token limit with thousands separators', () => {
  const out = renderDoctor(base({ contextLimit: 1000000 }))
  assert.match(line(out, 'context'), /\[OK\].*1,000,000 tokens/)
  // A zero or negative limit is not a row at all.
  assert.ok(!renderDoctor(base({ contextLimit: 0 })).includes('context'))
  assert.ok(!renderDoctor(base({ contextLimit: -5 })).includes('context'))
})

test('the password row is a WARN when the store degraded', () => {
  const ok = renderDoctor(base({ passwordStore: { store: 'config' } }))
  assert.match(line(ok, 'password'), /\[OK\].*config/)
  const bad = renderDoctor(
    base({ passwordStore: { store: 'config', degraded: true } }),
  )
  assert.match(
    line(bad, 'password'),
    /\[WARN\].*config \(keychain unavailable\)/,
  )
  assert.ok(!renderDoctor(base()).includes('password'))
})

test('a value with a newline cannot fake another row', () => {
  const out = renderDoctor(base({ workdir: '/p' + NL + '[OK] forged' }))
  // The injected line is COLLAPSED into the workdir row instead of starting a
  // new one: one row is always one terminal line.
  assert.equal(out.split(NL).filter((l) => l.includes('forged')).length, 1)
  assert.ok(line(out, 'workdir').includes('forged'))
  assert.ok(!out.split(NL).some((l) => l.startsWith(' [OK] forged')))
})

test('the table always starts with the title and the fixed rows', () => {
  const out = renderDoctor(base())
  const rows = out.split(NL)
  assert.equal(rows[0], 'Doctor:')
  for (const label of [
    'node',
    'platform',
    'workdir',
    'git',
    'config',
    'browser',
    'auth',
    'clipboard',
    'mcp',
    'transcript',
  ]) {
    assert.ok(line(out, label), label)
  }
  // The label column is padded to 16 characters, so the values line up.
  // " [OK]  " is 8 chars, then the 16-char label column, then the value.
  assert.equal(line(out, 'node'), ' [OK]  node' + ' '.repeat(12) + ' v24')
})

test('a broken config row names the error, or says unknown', () => {
  const withError = renderDoctor(
    base({ configOk: false, configError: 'bad json' }),
  )
  assert.match(line(withError, 'config'), /\[WARN\].*error: bad json/)
  const noError = renderDoctor(base({ configOk: false }))
  assert.match(line(noError, 'config'), /\[WARN\].*error: unknown/)
})
