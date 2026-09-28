import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LineEditor,
  formatTokenStatus,
  tokenStatusLevel,
  CONTEXT_LIMIT,
  CONTEXT_YELLOW_PCT,
  CONTEXT_RED_PCT,
} from '../src/input.ts'
import {
  buildCompactPrompt,
  buildCompactCarryover,
} from '../src/commands.ts'

// ---------- token status formatting ----------

test('formatTokenStatus: compact k/M and percent of the limit', () => {
  assert.equal(formatTokenStatus(0), '0 · 0.0%')
  assert.equal(formatTokenStatus(999), '999 · 0.1%')
  assert.equal(formatTokenStatus(10_000), '10k · 1.0%')
  assert.equal(formatTokenStatus(125_000), '125k · 13%')
  assert.equal(formatTokenStatus(1_000_000), '1M · 100%')
  assert.equal(formatTokenStatus(1_500_000), '1.5M · 150%')
})

test('formatTokenStatus: null/undefined/NaN hide the status', () => {
  assert.equal(formatTokenStatus(null), '')
  assert.equal(formatTokenStatus(undefined), '')
  assert.equal(formatTokenStatus(Number.NaN), '')
  assert.equal(formatTokenStatus(-5), '')
})

test('formatTokenStatus: honors a custom limit', () => {
  assert.equal(formatTokenStatus(50, 100), '50 · 50%')
})

test('tokenStatusLevel: green/yellow/red thresholds', () => {
  assert.equal(tokenStatusLevel(0), 'ok')
  // 499_999 tokens -> 49.9999% -> green; 500_000 -> 50% -> yellow
  assert.equal(tokenStatusLevel(499_999), 'ok')
  assert.equal(tokenStatusLevel(500_000), 'warn')
  assert.equal(tokenStatusLevel(799_999), 'warn')
  assert.equal(tokenStatusLevel(800_000), 'high')
  assert.equal(tokenStatusLevel(1_500_000), 'high')
})

test('tokenStatusLevel: null for invalid input', () => {
  assert.equal(tokenStatusLevel(null), null)
  assert.equal(tokenStatusLevel(undefined), null)
  assert.equal(tokenStatusLevel(Number.NaN), null)
  assert.equal(tokenStatusLevel(-1), null)
})

test('tokenStatusLevel: honors a custom limit', () => {
  assert.equal(tokenStatusLevel(50, 100), 'warn')
  assert.equal(tokenStatusLevel(80, 100), 'high')
  assert.equal(tokenStatusLevel(10, 100), 'ok')
})

test('CONTEXT_LIMIT is 1M', () => {
  assert.equal(CONTEXT_LIMIT, 1_000_000)
})

// ---------- editor status line ----------

test('setContextStatus stores the formatted token text', () => {
  const e = new LineEditor()
  e._render = () => {}
  e.setContextStatus(12_500)
  assert.equal(e.contextStatus, '12.5k · 1.3%')
})

test('onContextQuery refreshes the context on every render', () => {
  const e = new LineEditor()
  e._render = () => {}
  let value: number | null = 1000
  e.onContextQuery = () => value
  assert.equal(e._contextForRender(), '1k · 0.1%')
  value = 250_000
  assert.equal(e._contextForRender(), '250k · 25%')
  value = null
  assert.equal(e._contextForRender(), null)
})

test('a throwing onContextQuery does not break the render', () => {
  const e = new LineEditor()
  e._render = () => {}
  e.onContextQuery = () => {
    throw new Error('boom')
  }
  assert.equal(e._contextForRender(), null)
})

// ---------- /compact prompt helpers ----------

test('buildCompactPrompt: both languages, self-sufficient instructions', () => {
  const ru = buildCompactPrompt('ru')
  const en = buildCompactPrompt('en')
  assert.ok(ru.length > 50 && en.length > 50)
  assert.notEqual(ru, en)
  assert.ok(/резюме/i.test(ru))
  assert.ok(/summary/i.test(en))
  // The summary must carry the state, not just a topic list.
  assert.ok(ru.includes('следующие конкретные шаги'))
  assert.ok(en.includes('next concrete steps'))
})

test('buildCompactCarryover: wraps the summary and keeps the goal', () => {
  const out = buildCompactCarryover('did X and Y', 'finish Z')
  assert.ok(out.includes('did X and Y'))
  assert.ok(out.includes('Original task: finish Z'))
  assert.ok(/compacted/i.test(out))
})

test('buildCompactCarryover: no goal, empty summary is safe', () => {
  const out = buildCompactCarryover('', '')
  assert.ok(out.length > 0)
  assert.ok(!out.includes('Original task:'))
})
