import { test } from 'node:test'
import type { TranslateFn } from '../src/i18n.ts'
import assert from 'node:assert/strict'
import { recoverFromContextLimit } from '../src/context-limit.ts'

// The retry budget is `attempt > maxRetries`. A NON-FINITE `maxRetries` (a
// hand-edited config, `browser.maxContextLimitRetries: null` coerced somewhere)
// makes that comparison FALSE forever: `attempt > NaN` is false, so the chat
// that can NEVER accept another message is re-compacted on every send without
// any budget. Only a finite, non-negative budget may allow the retry.
const t: TranslateFn = (k, p) => k + (p ? JSON.stringify(p) : '')

test('a NaN retry budget gives up instead of retrying forever', async () => {
  let calls = 0
  const r = await recoverFromContextLimit(
    {
      recover: async () => {
        calls++
        return false
      },
      maxRetries: Number.NaN,
      attempt: 1,
      notice: () => {},
      t,
      keys: { compact: 'c', compactFailed: 'f', giveUp: 'g' },
      provider: 'DS',
    },
    new Error('orig'),
  )
  assert.equal(r.resend, false)
  assert.equal(calls, 0, 'the compaction ran with no budget')
})

test('a normal budget still compacts once', async () => {
  let calls = 0
  const r = await recoverFromContextLimit(
    {
      recover: async () => {
        calls++
        return true
      },
      maxRetries: 1,
      attempt: 1,
      notice: () => {},
      t,
      keys: { compact: 'c', compactFailed: 'f', giveUp: 'g' },
      provider: 'DS',
    },
    new Error('orig'),
  )
  assert.equal(r.resend, true)
  assert.equal(calls, 1)
})
