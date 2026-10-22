// summarizeSends() averages the `blockMs` of rate-limit events for /limits.
// The value comes from a JSONL file that a crash, a hand edit or a future
// writer can corrupt: a non-finite `blockMs` (NaN/Infinity, or a JSON `null`
// cast) was kept by the `typeof === 'number'` filter, the sum became NaN and
// /limits printed "average block: NaN s" — a nonsensical number the operator
// reads as data. Only FINITE positive durations belong in the average.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeSends, type SendEvent } from '../src/send-telemetry.ts'

const now = Date.now()

function ev(blockMs: unknown): SendEvent {
  return {
    at: new Date(now).toISOString(),
    provider: 'glm',
    intervalMs: 0,
    waitedMs: 0,
    outcome: 'rate_limit',
    blockMs: blockMs as number,
  }
}

test('a NaN blockMs does not poison the average', () => {
  const st = summarizeSends([ev(NaN), ev(5000)], now)
  assert.equal(Number.isFinite(st.avgBlockMs), true, String(st.avgBlockMs))
  assert.equal(st.avgBlockMs, 5000)
})

test('an Infinity blockMs is ignored', () => {
  const st = summarizeSends([ev(Infinity)], now)
  assert.equal(st.avgBlockMs, 0)
})

test('a normal average still works', () => {
  const st = summarizeSends([ev(2000), ev(4000)], now)
  assert.equal(st.avgBlockMs, 3000)
})
