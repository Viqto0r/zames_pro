import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusBadges } from '../src/tui/StatusBar.tsx'
import { TuiStore } from '../src/tui/store.ts'
import { translate } from '../src/i18n.ts'

// The badge row is what tells the operator WHAT is on: the provider, the task
// counter, the toggles (thinking/search) and the context fill. A badge silently
// disappearing (or coming out with the wrong role color) is invisible in a
// screenshot but breaks the status line, so the derivation is unit-tested
// here instead of only being eyeballed.

const t = translate('ru')

function state(over: Record<string, unknown>) {
  const s = new TuiStore()
  s.set(over as never)
  return s.getSnapshot()
}

test('every configured badge is listed with its own role', () => {
  const badges = statusBadges(
    state({
      statusLine: 'ci ✓',
      provider: 'DeepSeek',
      queueLength: 2,
      tasks: 'задачи: 8/8',
      thinkingEnabled: true,
      searchEnabled: true,
      contextText: 'ctx: 156k · 16%',
      contextLevel: 'warn',
    }),
  )
  const keys = badges.map((b) => b.key)
  assert.deepEqual(keys, ['sl', 'prov', 'q', 't', 'tg', 'ctx'])
  // The task counter must be a badge of its own (it was reported as
  // "the tasks counter does not change with the theme" — the color has to come
  // from the palette, not from a hardcoded gray).
  const tasks = badges.find((b) => b.key === 't')
  assert.ok(tasks)
  assert.match(tasks.label, /8\/8/)
  // Toggles render from the same flags the browser reports.
  const tg = badges.find((b) => b.key === 'tg')
  assert.ok(tg && tg.label.includes('🧠') && tg.label.includes('🌐'))
})

test('an empty state lists nothing (the row disappears)', () => {
  assert.deepEqual(statusBadges(state({})), [])
})

test('the context badge carries the level marker', () => {
  const bad = statusBadges(
    state({ contextText: 'ctx: 900k', contextLevel: 'high' }),
  ).find((b) => b.key === 'ctx')
  assert.ok(bad && bad.label.startsWith('⛔'))
  const warn = statusBadges(
    state({ contextText: 'ctx: 500k', contextLevel: 'warn' }),
  ).find((b) => b.key === 'ctx')
  assert.ok(warn && warn.label.startsWith('▲'))
  const ok = statusBadges(
    state({ contextText: 'ctx: 1k', contextLevel: 'ok' }),
  ).find((b) => b.key === 'ctx')
  assert.ok(ok && !ok.label.startsWith('▲'))
})

test('a thinking-only state shows the thinking toggle alone', () => {
  const tg = statusBadges(state({ thinkingEnabled: true })).find(
    (b) => b.key === 'tg',
  )
  assert.ok(tg)
  assert.ok(tg.label.includes('🧠'))
  assert.ok(!tg.label.includes('🌐'))
})
