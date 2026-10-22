import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatRelativeTime } from '../src/commands.ts'

// `formatRelativeTime` clamps the difference with `Math.max(0, now - then)`,
// so a timestamp SLIGHTLY in the future (clock skew, a file copied from a
// machine with a faster clock) reads "just now" — correct. But a date in the
// DISTANT future (a corrupted/absurd `updatedAt`, or a year-9999 timestamp)
// was clamped to zero as well, so /sessions showed a fresh entry for a session
// that cannot have been updated yet. A future date must say so, not pretend
// it is now.
const t = (k: string, p?: Record<string, string>) =>
  p ? k + ':' + JSON.stringify(p) : k

test('a slightly future timestamp is "just now" (clock skew)', () => {
  const now = Date.UTC(2026, 0, 1)
  const iso = new Date(now + 30_000).toISOString()
  assert.equal(formatRelativeTime(iso, t as never, now), 'time.now')
})

test('a distant future timestamp is not shown as now', () => {
  const now = Date.UTC(2026, 0, 1)
  const iso = new Date(now + 365 * 24 * 3600 * 1000).toISOString()
  const out = formatRelativeTime(iso, t as never, now)
  assert.notEqual(out, 'time.now', 'a 1-year-future date read as "just now"')
})
