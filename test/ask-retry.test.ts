import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideRetry,
  type RetryBudgets,
  type RetryState,
} from '../src/ask-retry.ts'

// The ask() retry policy shared by the providers. Every branch of the old
// three-copy loop is pinned here so a fix in one place cannot silently drop a
// family (rate limit / busy / incomplete / context limit / fatal / generic).

const budgets: RetryBudgets = {
  askRetries: 3,
  maxRateLimitRetries: 2,
  maxServerBusyRetries: 2,
  maxIncompleteRetries: 2,
  maxContextLimitRetries: 2,
}
const waits = { rateLimitMs: 300_000, serverBusyMs: 5_000, incompleteMs: 2_000 }
const fresh = (over: Partial<RetryState> = {}): RetryState => ({
  attempt: 0,
  rateLimitRetries: 0,
  serverBusyRetries: 0,
  incompleteRetries: 0,
  contextLimitRetries: 0,
  ...over,
})

test('a rate limit waits the long pause while its budget lasts', () => {
  const d = decideRetry('rate-limit', fresh(), budgets, waits)
  assert.deepEqual(d, {
    kind: 'wait',
    family: 'rate-limit',
    waitMs: waits.rateLimitMs,
  })
})

test('an exhausted rate-limit budget gives up', () => {
  const d = decideRetry(
    'rate-limit',
    fresh({ rateLimitRetries: 2 }),
    budgets,
    waits,
  )
  assert.equal(d.kind, 'give-up')
})

test('server busy and incomplete have their own short pauses', () => {
  assert.equal(decideRetry('server-busy', fresh(), budgets, waits).kind, 'wait')
  assert.equal(decideRetry('incomplete', fresh(), budgets, waits).kind, 'wait')
  const busy = decideRetry('server-busy', fresh(), budgets, waits) as {
    waitMs: number
  }
  assert.equal(busy.waitMs, waits.serverBusyMs)
  assert.equal(
    decideRetry('server-busy', fresh({ serverBusyRetries: 2 }), budgets, waits)
      .kind,
    'give-up',
  )
  assert.equal(
    decideRetry('incomplete', fresh({ incompleteRetries: 2 }), budgets, waits)
      .kind,
    'give-up',
  )
})

test('a context limit compacts into a fresh chat, not a resend', () => {
  assert.deepEqual(decideRetry('context-limit', fresh(), budgets, waits), {
    kind: 'compact',
    family: 'context-limit',
  })
  assert.equal(
    decideRetry(
      'context-limit',
      fresh({ contextLimitRetries: 2 }),
      budgets,
      waits,
    ).kind,
    'give-up',
  )
})

test('a fatal family gives up at once (guest limit, captcha, age gate)', () => {
  assert.equal(decideRetry('fatal', fresh(), budgets, waits).kind, 'give-up')
})

test('a generic failure uses the attempt budget with a growing pause', () => {
  const d = decideRetry(null, fresh({ attempt: 0 }), budgets, waits)
  assert.deepEqual(d, { kind: 'generic', waitMs: 2000 })
  assert.deepEqual(decideRetry(null, fresh({ attempt: 1 }), budgets, waits), {
    kind: 'generic',
    waitMs: 4000,
  })
  // The last attempt of the budget gives up instead of waiting forever.
  assert.equal(
    decideRetry(null, fresh({ attempt: 2 }), budgets, waits).kind,
    'give-up',
  )
})

test('the classification is per FAMILY, not per message text', () => {
  // Same wording, different family: the decision follows the class.
  assert.equal(decideRetry('fatal', fresh(), budgets, waits).kind, 'give-up')
  assert.equal(decideRetry('rate-limit', fresh(), budgets, waits).kind, 'wait')
})
