import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySendEvent,
  DEFAULT_THROTTLE,
  initialThrottleState,
  nextWaitMs,
} from '../src/send-throttle.ts'

const cfg = { baseMs: 1000, rateLimitWaitMs: 60000, ...DEFAULT_THROTTLE }
const now = 1_000_000
const rateLimit = (retryAfterMs: number) =>
  ({
    at: new Date(now).toISOString(),
    outcome: 'rate_limit',
    retryAfterMs,
  }) as never

// A Retry-After header can arrive as `Infinity` (a proxy that answers
// `Retry-After: Infinity`, or a parsed overflow). It is a NUMBER and > 0, so it
// was taken as the forced wait: the throttle then blocked EVERY send forever
// (`nextWaitMs` returns Infinity), i.e. the agent went silent for good with no
// way to recover. An unusable value must fall back to the configured pause.
test('a non-finite retryAfterMs falls back to the configured pause', () => {
  const s = applySendEvent(
    initialThrottleState(cfg),
    rateLimit(Number.POSITIVE_INFINITY),
    cfg,
    now,
  )
  assert.equal(s.forcedWaitMs, cfg.rateLimitWaitMs)
  assert.equal(nextWaitMs(s, now, now), cfg.rateLimitWaitMs)
})

test('a real retryAfterMs is still honoured', () => {
  const s = applySendEvent(
    initialThrottleState(cfg),
    rateLimit(30_000),
    cfg,
    now,
  )
  assert.equal(s.forcedWaitMs, 30_000)
  assert.equal(nextWaitMs(s, now, now), 30_000)
})
