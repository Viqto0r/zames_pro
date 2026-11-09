import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDoctor } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'
import {
  DEFAULT_DIAGNOSTICS,
  shouldRunDiagnostics,
} from '../src/diagnostics.ts'

// test/commands.test.ts pins a handful of /doctor rows. The rest of the table
// — the provider/model row, the swallowed-failure row, the UI-probe row and
// the diagnostics GATE — had no test: a row rendered with the WRONG status is
// worse than a missing one, because the operator trusts it.

const t = translate('en')

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

const rowOf = (out: string, label: string): string => {
  const line = out
    .split(String.fromCharCode(10))
    .find((l) => l.includes(' ' + label + ' '))
  assert.ok(line, 'no ' + label + ' row in:\n' + out)
  return line
}

test('the provider row is lowercased and carries the model in parens', () => {
  const out = renderDoctor(base({ provider: 'qwen', providerModel: 'max' }))
  const row = rowOf(out, 'provider')
  assert.match(row, /\[OK\]/)
  assert.match(row, /qwen \(max\)/)
  // Without a model the parens are omitted entirely.
  const plain = rowOf(renderDoctor(base({ provider: 'glm' })), 'provider')
  assert.match(plain, /glm$/)
  assert.ok(!plain.includes('('))
})

test('a swallowed failure is a WARN row that names its tags', () => {
  const out = renderDoctor(
    base({
      swallowedTop: [
        { tag: 'selector', count: 3 },
        { tag: 'probe', count: 1 },
      ],
    }),
  )
  const row = rowOf(out, 'swallowed')
  assert.match(row, /\[WARN\]/)
  assert.match(row, /selector:3, probe:1/)
  // No row at all when nothing was swallowed.
  const none = renderDoctor(base({ swallowedTop: [] }))
  assert.ok(!none.includes('swallowed'))
})

test('a missing UI capability is a WARN row, a critical one names it', () => {
  const degraded = renderDoctor(
    base({
      provider: 'deepseek',
      uiPresent: ['input'],
      uiMissing: ['toggles'],
    }),
  )
  const row = rowOf(degraded, 'deepseek ui')
  assert.match(row, /\[WARN\]/)
  assert.match(row, /toggles/)
  const broken = renderDoctor(
    base({
      provider: 'glm',
      uiPresent: [],
      uiMissing: ['input', 'send'],
      uiMissingCritical: ['input', 'send'],
    }),
  )
  const bad = rowOf(broken, 'glm ui')
  assert.match(bad, /\[WARN\]/)
  assert.match(bad, /MISSING critical/i)
  // A healthy page is an OK row.
  const ok = renderDoctor(
    base({ provider: 'qwen', uiPresent: ['input'], uiMissing: [] }),
  )
  assert.match(rowOf(ok, 'qwen ui'), /\[OK\]/)
  // No probe run -> no row.
  assert.ok(!renderDoctor(base()).includes('ui'))
})

test('an adaptive provider at 0 ms is NOT a warning', () => {
  const adaptive = renderDoctor(
    base({ minSendIntervalMs: 0, adaptiveThrottle: true }),
  )
  assert.match(rowOf(adaptive, 'send pause'), /\[OK\]/)
  assert.match(rowOf(adaptive, 'send pause'), /adaptive pause/)
  const plain = renderDoctor(base({ minSendIntervalMs: 0 }))
  assert.match(rowOf(plain, 'send pause'), /\[WARN\]/)
})

test('the transcript row says on/off, the git remote row only with a repo', () => {
  assert.match(
    rowOf(renderDoctor(base({ transcriptOk: true })), 'transcript'),
    /on/,
  )
  assert.match(
    rowOf(renderDoctor(base({ transcriptOk: false })), 'transcript'),
    /off/,
  )
  // `hasOrigin` without a repo produces no row (there is no remote to talk
  // about).
  assert.ok(
    !renderDoctor(base({ gitOk: false, hasOrigin: false })).includes(
      'git remote',
    ),
  )
})

// ---------- the diagnostics GATE (defaults live here) ----------

test('diagnostics are OFF by default and only run after a mutating tool', () => {
  assert.equal(DEFAULT_DIAGNOSTICS.enabled, false)
  const on = { ...DEFAULT_DIAGNOSTICS, enabled: true }
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'ApplyPatch']) {
    // Disabled (or no config at all): never.
    assert.equal(shouldRunDiagnostics(DEFAULT_DIAGNOSTICS, tool), false, tool)
    assert.equal(shouldRunDiagnostics(null, tool), false, tool)
    assert.equal(shouldRunDiagnostics(undefined, tool), false, tool)
    // Enabled: only the mutating tools.
    assert.equal(shouldRunDiagnostics(on, tool), true, tool)
  }
  for (const tool of ['Read', 'Bash', 'Grep', 'respond']) {
    assert.equal(shouldRunDiagnostics(on, tool), false, tool)
  }
  // An EMPTY command disables the check even when `enabled` is on.
  assert.equal(shouldRunDiagnostics({ ...on, command: '   ' }, 'Edit'), false)
  // A custom tool list is honoured instead of the default one.
  assert.equal(shouldRunDiagnostics({ ...on, tools: ['Bash'] }, 'Bash'), true)
  assert.equal(shouldRunDiagnostics({ ...on, tools: ['Bash'] }, 'Edit'), false)
})
