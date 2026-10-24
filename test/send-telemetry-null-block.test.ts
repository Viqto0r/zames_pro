// summarizeSends() averages the block durations. `Number(null)` is 0 (a finite
// non-negative number), so an event that carries NO blockMs (the rate-limit
// event only records `blockedAt`; the duration is measured later by
// `onBlockLifted`) was counted as a ZERO-length block and halved the average.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeSends, type SendEvent } from '../src/send-telemetry.ts'

const now = Date.now()
const ev = (blockMs: unknown): SendEvent =>
  ({
    at: new Date(now - 1000).toISOString(),
    provider: 'deepseek',
    intervalMs: 15000,
    waitedMs: 15000,
    outcome: 'rate_limit',
    blockMs,
  }) as SendEvent

test('an event without a block duration is not averaged as zero', () => {
  const stats = summarizeSends([ev(null), ev(120000)], now)
  assert.equal(stats.avgBlockMs, 120000)
})

test('an event without blockMs at all is skipped too', () => {
  const stats = summarizeSends([ev(undefined), ev(60000)], now)
  assert.equal(stats.avgBlockMs, 60000)
})

test('real block durations still average (control)', () => {
  const stats = summarizeSends([ev(60000), ev(120000)], now)
  assert.equal(stats.avgBlockMs, 90000)
})
