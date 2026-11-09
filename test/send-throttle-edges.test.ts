import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialThrottleState,
  applySendEvent,
  nextWaitMs,
  withBlockDuration,
  DEFAULT_THROTTLE,
  type ThrottleConfig,
} from '../src/send-throttle.ts'

// test/send-throttle.test.ts pins the learning rules. The EDGES of the state
// machine were open: the initial state, the forced-wait EXPIRY, the block
// start kept across two limits, a retryAfter ABOVE the ceiling, the soft
// budget's growth, and `withBlockDuration` on a non-limit / zero-start event.

const cfg: ThrottleConfig = {
  baseMs: 1000,
  rateLimitWaitMs: 60_000,
  ...DEFAULT_THROTTLE,
}
const NOW = 1_700_000_000_000
const at = (ms: number): string => new Date(ms).toISOString()

const ev = (over: Record<string, unknown>): never =>
  ({ at: at(NOW), outcome: 'ok', ...over }) as never

test('the initial state is not blocked and starts at the base interval', () => {
  const s = initialThrottleState(cfg)
  assert.deepEqual(
    { intervalMs: s.intervalMs, okStreak: s.okStreak, blocked: s.blocked },
    { intervalMs: 1000, okStreak: 0, blocked: false },
  )
  assert.equal(s.forcedWaitMs, 0)
  assert.deepEqual(s.recent, [])
})

test('an ok event records the send and counts the streak', () => {
  const s = applySendEvent(initialThrottleState(cfg), ev({}), cfg, NOW)
  assert.equal(s.okStreak, 1)
  assert.equal(s.recent.length, 1)
  assert.equal(s.intervalMs, 1000)
})

test('a retryAfter above the ceiling is clamped to the learned max', () => {
  const s = applySendEvent(
    initialThrottleState(cfg),
    ev({ outcome: 'rate_limit', retryAfterMs: 999_999_999 }),
    cfg,
    NOW,
  )
  assert.equal(s.forcedWaitMs, cfg.maxMs)
  // The interval doubles from the floor, capped at maxMs.
  assert.equal(s.intervalMs, 4000)
  assert.equal(s.blocked, true)
  assert.equal(s.blockedAt, NOW)
})

test('a second limit KEEPS the original block start', () => {
  const first = applySendEvent(
    initialThrottleState(cfg),
    ev({ outcome: 'rate_limit' }),
    cfg,
    NOW,
  )
  const second = applySendEvent(
    first,
    ev({ outcome: 'rate_limit', at: at(NOW + 5000) }),
    cfg,
    NOW + 5000,
  )
  assert.equal(second.blockedAt, NOW, 'the block start was reset')
})

test('the forced wait EXPIRES: the remaining time shrinks, then is 0', () => {
  const blocked = applySendEvent(
    initialThrottleState(cfg),
    ev({ outcome: 'rate_limit', retryAfterMs: 30_000 }),
    cfg,
    NOW,
  )
  assert.equal(blocked.forcedWaitAt, NOW)
  assert.equal(nextWaitMs(blocked, 0, NOW + 1000), 29_000)
  assert.equal(nextWaitMs(blocked, 0, NOW + 30_000), 0)
  assert.equal(nextWaitMs(blocked, 0, NOW + 60_000), 0)
})

test('the learned interval applies since the last send', () => {
  const s = initialThrottleState(cfg)
  assert.equal(nextWaitMs(s, 0, NOW), 0, 'no send yet -> no wait')
  assert.equal(nextWaitMs(s, NOW - 400, NOW), 600)
  assert.equal(nextWaitMs(s, NOW - 5000, NOW), 0)
})

test('a busy event keeps the interval and still counts in the window', () => {
  const start = initialThrottleState(cfg)
  const s = applySendEvent(start, ev({ outcome: 'busy' }), cfg, NOW)
  assert.equal(s.intervalMs, start.intervalMs)
  assert.equal(s.recent.length, 1)
})

test('the soft budget GROWS the interval smoothly once over it', () => {
  const start = { ...initialThrottleState(cfg), recent: [NOW, NOW, NOW] }
  const s = applySendEvent(start, ev({}), { ...cfg, budget: 2 }, NOW)
  // 4 sends in the window, budget 2 -> +2000ms over the base.
  assert.equal(s.intervalMs, 3000)
  assert.equal(s.recent.length, 4)
  // An INFINITE budget never fires (the default).
  const inf = applySendEvent(
    start,
    ev({}),
    { ...cfg, budget: Number.POSITIVE_INFINITY },
    NOW,
  )
  assert.equal(inf.intervalMs, cfg.baseMs)
})

test('withBlockDuration only annotates a real rate-limit event', () => {
  assert.deepEqual(withBlockDuration(ev({ outcome: 'rate_limit' }), 100, 350), {
    at: at(NOW),
    outcome: 'rate_limit',
    blockMs: 250,
  })
  // A non-limit event is returned untouched.
  assert.deepEqual(withBlockDuration(ev({}), 100, 350), {
    at: at(NOW),
    outcome: 'ok',
  })
  // No block start -> nothing to measure.
  assert.deepEqual(withBlockDuration(ev({ outcome: 'rate_limit' }), 0, 350), {
    at: at(NOW),
    outcome: 'rate_limit',
  })
  // A liftedAt BEFORE blockedAt never yields a negative duration.
  assert.equal(
    (
      withBlockDuration(ev({ outcome: 'rate_limit' }), 500, 100) as {
        blockMs?: number
      }
    ).blockMs,
    0,
  )
})
