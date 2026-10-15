import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  qwenContextWindow,
  normalizeModelId,
} from '../src/qwen-ui.ts'
import { formatTokenStatus, tokenStatusLevel } from '../src/input/layout.ts'

// Qwen's context window is PER-MODEL, and the number is the denominator of
// both the status-bar fill percentage and the auto-compact threshold. An
// overstated window (the old global 1M on a 258K model) delays compaction
// until the provider errors out; an understated one fires it far too early.

// ---------- normalizeModelId ----------

test('normalizeModelId lowercases and drops non-alphanumerics', () => {
  assert.equal(normalizeModelId('Qwen3-Max'), 'qwen3max')
  assert.equal(normalizeModelId('qwen3.7-max'), 'qwen37max')
  assert.equal(normalizeModelId('qwen3_coder_plus'), 'qwen3coderplus')
})

test('normalizeModelId tolerates empty / undefined input', () => {
  assert.equal(normalizeModelId(''), '')
  assert.equal(normalizeModelId(undefined), '')
})

// ---------- qwenContextWindow ----------

test('qwenContextWindow: Qwen3-Max is 258K, not 1M', () => {
  assert.equal(qwenContextWindow('qwen3-max'), 258_048)
  assert.equal(qwenContextWindow('Qwen3-Max'), 258_048)
})

test('qwenContextWindow: the 1M builds are matched BEFORE the max rule', () => {
  // `qwen3.7-max` must NOT fall through to the 258K `qwen3max` row.
  assert.equal(qwenContextWindow('qwen3.7-max'), 1_000_000)
  assert.equal(qwenContextWindow('qwen3-7-max'), 1_000_000)
  assert.equal(qwenContextWindow('qwen3.8-max'), 1_000_000)
})

test('qwenContextWindow: coder and long builds have their own windows', () => {
  assert.equal(qwenContextWindow('qwen3-coder-plus'), 1_000_000)
  assert.equal(qwenContextWindow('qwen3-coder-flash'), 1_000_000)
  assert.equal(qwenContextWindow('qwen-long'), 10_000_000)
})

test('qwenContextWindow: an unknown qwen3 build falls back to 1M', () => {
  assert.equal(qwenContextWindow('qwen3-plus'), 1_000_000)
  assert.equal(qwenContextWindow('qwen3-turbo'), 1_000_000)
})

test('qwenContextWindow: a non-qwen id is unknown (null)', () => {
  assert.equal(qwenContextWindow('gpt-5'), null)
  assert.equal(qwenContextWindow(''), null)
  assert.equal(qwenContextWindow(undefined), null)
})

test('qwenContextWindow: an unknown id must NOT guess a window', () => {
  // The resolver returns null so the caller can leave the manual setting
  // alone instead of committing to a wrong denominator.
  assert.equal(qwenContextWindow('mystery-model-9000'), null)
})

// ---------- the window drives the status/auto-compact percentage ----------

test('a 258K model fills up far sooner than a 1M one (same token count)', () => {
  // 230k tokens: nearly full on Qwen3-Max, comfortable on a 1M build.
  const tokens = 230_000
  assert.equal(tokenStatusLevel(tokens, qwenContextWindow('qwen3-max')!), 'high')
  assert.equal(
    tokenStatusLevel(tokens, qwenContextWindow('qwen3.7-max')!),
    'ok',
  )
  // The formatted percentage reflects the per-model denominator.
  assert.ok(formatTokenStatus(tokens, 258_048).includes('89%'))
  assert.ok(formatTokenStatus(tokens, 1_000_000).includes('23%'))
})
