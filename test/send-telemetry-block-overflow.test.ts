// summarizeSends() averages the `blockMs` of rate-limit events for /limits.
// The value comes from a JSONL file that a crash, a hand edit, a broken writer
// or a clock jump can corrupt. Every finite value passed the old filter, but
// the SUM of two large (yet finite) durations overflows a JS number: two
// Number.MAX_VALUE entries add up to Infinity, so /limits printed
// "average block: Infinitys". A duration is a millisecond count, so a value
// beyond the JS safe-integer range is corrupt data, not a block: it is dropped
// and the average stays finite.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeSends, type SendEvent } from '../src/send-telemetry.ts'

const now = Date.now()

function ev(blockMs: number): SendEvent {
  return {
    at: new Date(now).toISOString(),
    provider: 'glm',
    intervalMs: 0,
    waitedMs: 0,
    outcome: 'rate_limit',
    blockMs,
  }
}

test('an out-of-range blockMs does not make the average Infinity', () => {
  const st = summarizeSends([ev(Number.MAX_VALUE), ev(Number.MAX_VALUE)], now)
  assert.equal(Number.isFinite(st.avgBlockMs), true, String(st.avgBlockMs))
  assert.equal(st.avgBlockMs, 0)
})

test('an out-of-range blockMs is dropped, a sane one still averages', () => {
  const st = summarizeSends([ev(1e300), ev(2000), ev(4000)], now)
  assert.equal(Number.isFinite(st.avgBlockMs), true, String(st.avgBlockMs))
  assert.equal(st.avgBlockMs, 3000)
})

test('a normal average still works', () => {
  const st = summarizeSends([ev(2000), ev(4000)], now)
  assert.equal(st.avgBlockMs, 3000)
})
