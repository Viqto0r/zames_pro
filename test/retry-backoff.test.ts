import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_BACKOFF,
  backoffWaitMs,
  canRetry,
  clampWait,
  floorWait,
  normalizeMaxWait,
  type RetryBackoffConfig,
} from '../src/retry-backoff.ts'

// The incremental retry backoff shared by the providers' ask() loops and the
// agent-loop watchdog. The point of the module is that a LONG server block is
// waited out: every retry waits longer than the previous one, up to a ceiling,
// and the counted budget no longer ends the wait while the server is still
// asking us to.

const cfg: RetryBackoffConfig = {
  infiniteRetries: true,
  maxRetries: 6,
  baseWaitMs: 5 * 60_000,
  maxWaitMs: 30 * 60_000,
}

// Jitter off: the escalation is exact.
const wait = (attempt: number, over: Partial<RetryBackoffConfig> = {}) =>
  backoffWaitMs({ ...cfg, ...over }, attempt, { jitter: false })

test('the wait doubles on every retry and stops at the ceiling', () => {
  assert.equal(wait(1), 5 * 60_000)
  assert.equal(wait(2), 10 * 60_000)
  assert.equal(wait(3), 20 * 60_000)
  assert.equal(wait(4), 30 * 60_000)
  assert.equal(wait(5), 30 * 60_000)
  assert.equal(wait(50), 30 * 60_000)
})

test('a short family base keeps its own first wait', () => {
  // server busy: 3 s, then 6 s, 12 s...
  assert.equal(wait(1, { baseWaitMs: 3000 }), 3000)
  assert.equal(wait(2, { baseWaitMs: 3000 }), 6000)
  assert.equal(wait(3, { baseWaitMs: 3000 }), 12000)
})

test('a Retry-After from the server wins over the curve', () => {
  const d = backoffWaitMs(cfg, 1, { serverWaitMs: 12 * 60_000, jitter: false })
  assert.equal(d, 12 * 60_000)
  // A tiny Retry-After must NOT shorten the escalation.
  const small = backoffWaitMs(cfg, 3, { serverWaitMs: 1000, jitter: false })
  assert.equal(small, 20 * 60_000)
})

test('a day-long Retry-After does not freeze the agent', () => {
  const d = backoffWaitMs(cfg, 1, {
    serverWaitMs: 24 * 3600_000,
    jitter: false,
  })
  assert.equal(d, 30 * 60_000)
})

test('a ceiling of 0 or Infinity means no ceiling', () => {
  assert.equal(wait(6, { maxWaitMs: 0 }), 5 * 60_000 * 32)
  assert.equal(
    wait(6, { maxWaitMs: Number.POSITIVE_INFINITY }),
    5 * 60_000 * 32,
  )
  assert.equal(normalizeMaxWait(Number.POSITIVE_INFINITY), 0)
  assert.equal(normalizeMaxWait(0), 0)
  assert.equal(normalizeMaxWait(-5), 0)
  assert.equal(normalizeMaxWait(1000), 1000)
})

test('a wait never drops below 500ms', () => {
  assert.equal(wait(1, { baseWaitMs: 1 }), 500)
  assert.equal(floorWait(0), 0)
  assert.equal(floorWait(1), 500)
  assert.equal(floorWait(2000), 2000)
})

test('jitter stays within +-10% of the deterministic wait', () => {
  for (let i = 0; i < 50; i++) {
    const w = backoffWaitMs(cfg, 1)
    assert.ok(w >= 5 * 60_000 * 0.9, 'jitter too small: ' + w)
    assert.ok(w <= 5 * 60_000 * 1.1, 'jitter too big: ' + w)
  }
})

test('canRetry: infinite means forever, counted uses maxRetries', () => {
  assert.equal(canRetry(cfg, 0), true)
  assert.equal(canRetry(cfg, 1000), true)
  const counted = { ...cfg, infiniteRetries: false }
  assert.equal(canRetry(counted, 5), true)
  assert.equal(canRetry(counted, 6), false)
  // maxRetries 0 = no counted limit either (a hand-edited config).
  assert.equal(canRetry({ ...counted, maxRetries: 0 }, 100), true)
})

test('a partial config (no infiniteRetries field) uses the counted budget', () => {
  // This is the safety net for a caller that predates the option: the field
  // is undefined, which must NOT be read as "retry forever".
  const partial = { maxRetries: 6 } as unknown as RetryBackoffConfig
  assert.equal(canRetry(partial, 2), true)
  assert.equal(canRetry(partial, 6), false)
})

test('clampWait tolerates a non-finite or negative wait', () => {
  assert.equal(clampWait(Number.NaN, 1000), 0)
  assert.equal(clampWait(-1, 1000), 0)
  assert.equal(clampWait(500, 1000), 500)
  assert.equal(clampWait(5000, 1000), 1000)
  assert.equal(clampWait(5000, 0), 5000)
})

test('DEFAULT_BACKOFF retries forever and caps one wait at 30 min', () => {
  assert.equal(DEFAULT_BACKOFF.infiniteRetries, true)
  assert.equal(DEFAULT_BACKOFF.maxWaitMs, 30 * 60_000)
  assert.equal(DEFAULT_BACKOFF.baseWaitMs, 5 * 60_000)
})
