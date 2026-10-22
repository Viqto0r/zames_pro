import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialThrottleState, nextWaitMs } from '../src/send-throttle.ts'

// A rate limit sets `forcedWaitMs` (the server's Retry-After). The wait was
// returned VERBATIM forever: `nextWaitMs` checked only `> 0`, so a long
// Retry-After kept blocking every send even hours later — until some other
// event cleared it. A forced wait must EXPIRE like any other deadline.
const cfg = {
  baseMs: 1000,
  rateLimitWaitMs: 5000,
  windowMs: 60_000,
  budget: Infinity,
  recoverAfter: 2,
  maxMs: 60_000,
  limitFloorMs: 2000,
}

test('a forced wait with a stamp expires when its time is up', () => {
  const now = 10_000_000
  const state = {
    ...initialThrottleState(cfg),
    forcedWaitMs: 5000,
    forcedWaitAt: now,
  }
  assert.equal(nextWaitMs(state, now, now), 5000)
  assert.equal(
    nextWaitMs(state, now, now + 3_600_000),
    0,
    'a 5s Retry-After still blocked a send an hour later',
  )
})

test('a stamp-less forced wait is honoured in full once', () => {
  const now = 10_000_000
  const state = { ...initialThrottleState(cfg), forcedWaitMs: 5000 }
  assert.equal(nextWaitMs(state, now, now), 5000)
})
