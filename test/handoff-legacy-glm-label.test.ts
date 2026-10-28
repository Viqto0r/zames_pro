// `handoffFromLabel()` labels a handoff that has no explicit `from` field
// (a file written when exactly TWO backends existed). It answered
// `provider === 'qwen' ? 'DeepSeek' : 'Qwen'`, which is only correct for those
// two: a LEGACY GLM handoff was announced as coming from Qwen, and the next
// GLM chat was told `Qwen -> GLM` while the summary actually came from
// DeepSeek. With three backends "the other one" is only well defined for
// qwen (the original two were deepseek and qwen); anything else falls back to
// DeepSeek, the original backend every old file predates.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handoffFromLabel } from '../src/provider-handoff.ts'

const base = { workdir: '', summary: 's', createdAt: '' }

test('a legacy qwen handoff comes from DeepSeek', () => {
  assert.equal(
    handoffFromLabel({ ...base, provider: 'qwen' } as never),
    'DeepSeek',
  )
})

test('a legacy GLM handoff does not claim Qwen wrote it', () => {
  const label = handoffFromLabel({ ...base, provider: 'glm' } as never)
  assert.notEqual(label, 'Qwen', 'a GLM handoff cannot come from Qwen')
  assert.equal(label, 'DeepSeek')
})

test('an explicit from field still wins', () => {
  assert.equal(
    handoffFromLabel({ ...base, provider: 'glm', from: 'qwen' } as never),
    'Qwen',
  )
})
