// formatDuration() turns a millisecond count into "1m 05s" for /cost, the
// per-task summary and /status. The value can be non-finite (a clock that
// jumped, an `Infinity` from a subtraction of an absent timestamp):
// `Math.round(NaN / 1000)` is NaN, every branch rendered it verbatim and the
// operator saw "длительность: NaNs" (or "Infinityh NaNm NaNs") instead of a
// duration. A non-finite/negative input must render as a clean zero duration.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDuration } from '../src/commands.ts'

test('NaN renders as a zero duration, not "NaNs"', () => {
  const out = formatDuration(NaN)
  assert.ok(!out.includes('NaN'), out)
  assert.equal(out, '0s')
})

test('Infinity renders as a zero duration, not "Infinityh NaNm NaNs"', () => {
  const out = formatDuration(Infinity)
  assert.ok(!/Infinity|NaN/.test(out), out)
  assert.equal(out, '0s')
})

test('a negative value stays zero', () => {
  assert.equal(formatDuration(-5000), '0s')
})

test('a real duration is unchanged', () => {
  assert.equal(formatDuration(65_000), '1m 05s')
})
