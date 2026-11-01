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
//
// INCREMENTAL RETRIES are the default now: a transient family does not run out
// of attempts, its WAIT escalates instead (5m -> 10m -> 20m -> capped), and
// only a fatal error or a cancel ends the wait. The counted mode is still
// reachable with `browser.infiniteRetries false` and pinned below.

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

// Jitter off so the waits are exact in the assertions.
const infinite = {
  infiniteRetries: true,
  maxRetries: 6,
  baseWaitMs: 300_000,
  maxWaitMs: 30 * 60_000,
}
const counted = {
  infiniteRetries: false,
  maxRetries: 6,
  baseWaitMs: 300_000,
  maxWaitMs: 0,
}
const decide = (
  family: Parameters<typeof decideRetry>[0],
  state: RetryState,
  backoff?: Parameters<typeof decideRetry>[4],
): ReturnType<typeof decideRetry> =>
  decideRetry(family, state, budgets, waits, backoff, { jitter: false })

const waitMsOf = (d: ReturnType<typeof decideRetry>): number =>
  (d as { waitMs: number }).waitMs

test('a rate limit waits the family pause and escalates on every retry', () => {
  const first = decide('rate-limit', fresh(), infinite)
  assert.deepEqual(first, {
    kind: 'wait',
    family: 'rate-limit',
    waitMs: waits.rateLimitMs,
  })
  // 5m -> 10m -> 20m -> 30m (the ceiling).
  assert.equal(
    waitMsOf(decide('rate-limit', fresh({ rateLimitRetries: 1 }), infinite)),
    2 * waits.rateLimitMs,
  )
  assert.equal(
    waitMsOf(decide('rate-limit', fresh({ rateLimitRetries: 2 }), infinite)),
    4 * waits.rateLimitMs,
  )
  assert.equal(
    waitMsOf(decide('rate-limit', fresh({ rateLimitRetries: 3 }), infinite)),
    30 * 60_000,
  )
})

test('an infinite family never gives up, however many retries were made', () => {
  for (const n of [2, 50, 1000]) {
    assert.equal(
      decide('rate-limit', fresh({ rateLimitRetries: n }), infinite).kind,
      'wait',
    )
  }
})

test('a Retry-After from the server wins over the learned curve', () => {
  const d = decideRetry(
    'rate-limit',
    fresh(),
    budgets,
    { ...waits, retryAfterMs: 12 * 60_000 },
    infinite,
    { jitter: false },
  )
  assert.equal(waitMsOf(d), 12 * 60_000)
  // ...but it is still capped by maxRetryWaitMs.
  const capped = decideRetry(
    'rate-limit',
    fresh(),
    budgets,
    { ...waits, retryAfterMs: 24 * 3600_000 },
    infinite,
    { jitter: false },
  )
  assert.equal(waitMsOf(capped), 30 * 60_000)
})

test('with infiniteRetries off the counted budget applies again', () => {
  // The counted mode uses `maxRetries` (6) as the family budget, so a state
  // below it still waits and a state at the ceiling gives up.
  assert.equal(
    decide('rate-limit', fresh({ rateLimitRetries: 2 }), counted).kind,
    'wait',
  )
  assert.equal(
    decide('server-busy', fresh({ serverBusyRetries: 2 }), counted).kind,
    'wait',
  )
  assert.equal(
    decide('incomplete', fresh({ incompleteRetries: 2 }), counted).kind,
    'wait',
  )
  assert.equal(
    decide('rate-limit', fresh({ rateLimitRetries: 6 }), counted).kind,
    'give-up',
  )
  assert.equal(
    decide('server-busy', fresh({ serverBusyRetries: 6 }), counted).kind,
    'give-up',
  )
  assert.equal(
    decide('incomplete', fresh({ incompleteRetries: 6 }), counted).kind,
    'give-up',
  )
})

test('a context limit compacts into a fresh chat, not a resend', () => {
  assert.deepEqual(decide('context-limit', fresh(), infinite), {
    kind: 'compact',
    family: 'context-limit',
  })
  // The compaction budget is counted even in the infinite mode.
  assert.equal(
    decide('context-limit', fresh({ contextLimitRetries: 2 }), infinite).kind,
    'give-up',
  )
})

test('a fatal family gives up at once (guest limit, captcha, age gate)', () => {
  assert.equal(decide('fatal', fresh(), infinite).kind, 'give-up')
})

test('a generic failure uses the attempt budget with a growing pause', () => {
  assert.deepEqual(decide(null, fresh({ attempt: 0 }), infinite), {
    kind: 'generic',
    waitMs: 2000,
  })
  assert.deepEqual(decide(null, fresh({ attempt: 1 }), infinite), {
    kind: 'generic',
    waitMs: 4000,
  })
  // A generic failure is NOT transient: the last attempt gives up even with
  // the infinite mode on.
  assert.equal(decide(null, fresh({ attempt: 2 }), infinite).kind, 'give-up')
})

test('the classification is per FAMILY, not per message text', () => {
  // Same wording, different family: the decision follows the class.
  assert.equal(decide('fatal', fresh(), infinite).kind, 'give-up')
  assert.equal(decide('rate-limit', fresh(), infinite).kind, 'wait')
})
