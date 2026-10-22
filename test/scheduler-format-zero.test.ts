import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatInterval, formatJobLine } from '../src/scheduler.ts'

// `formatInterval(0)` returns `0h`, because `0 % 3_600_000 === 0`. A job whose
// next fire is NOW (a fresh `/loop`, the first tick) is rendered as
// `next ~0h` — the operator reads "in zero hours" and has no idea it fires
// immediately.
test('formatInterval: zero is rendered in the smallest unit', () => {
  assert.equal(formatInterval(0), '0s')
})

test('formatJobLine: a job due now says so in seconds', () => {
  const line = formatJobLine(
    {
      id: 1,
      kind: 'loop',
      task: 'x',
      intervalMs: 1000,
      nextAt: 1_000_000,
      createdAt: 1_000_000,
    },
    1_000_000,
  )
  assert.ok(line.includes('next ~0s'), line)
})
