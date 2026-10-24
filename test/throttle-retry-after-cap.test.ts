// applySendEvent() accepts the server's Retry-After VERBATIM as `forcedWaitMs`.
// A server (or a proxy, or a hand-edited header) can send a value of days —
// `Retry-After: 86400` is a DAY — and the agent then waits that long before its
// next send, which the operator sees as a frozen agent. The throttle already
// has a ceiling for the learned interval (`maxMs`), but the forced wait had
// none. It must be bounded by the same ceiling: a longer block is not worth
// sitting out silently, and the next send can try again.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySendEvent,
  DEFAULT_THROTTLE,
  initialThrottleState,
  nextWaitMs,
  type ThrottleConfig,
} from '../src/send-throttle.ts'

const cfg: ThrottleConfig = {
  baseMs: 15_000,
  rateLimitWaitMs: 60_000,
  ...DEFAULT_THROTTLE,
  maxMs: 60_000,
}
const now = 1_000_000

test('a day-long Retry-After does not freeze the agent', () => {
  const st = applySendEvent(
    initialThrottleState(cfg),
    {
      at: new Date(now).toISOString(),
      provider: 'glm',
      intervalMs: 0,
      waitedMs: 0,
      outcome: 'rate_limit',
      retryAfterMs: 24 * 3600_000,
    },
    cfg,
    now,
  )
  assert.ok(
    st.forcedWaitMs <= cfg.maxMs,
    'forced wait ' + st.forcedWaitMs + ' > ' + cfg.maxMs,
  )
  assert.ok(nextWaitMs(st, 0, now) <= cfg.maxMs)
})

test('a short Retry-After is still used as-is', () => {
  const st = applySendEvent(
    initialThrottleState(cfg),
    {
      at: new Date(now).toISOString(),
      provider: 'glm',
      intervalMs: 0,
      waitedMs: 0,
      outcome: 'rate_limit',
      retryAfterMs: 5000,
    },
    cfg,
    now,
  )
  assert.equal(st.forcedWaitMs, 5000)
})
