import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInterval, nextCronTime } from '../src/scheduler.ts'

// A hand-edited or clock-corrupted `fromMs` (a machine whose clock jumped past
// 8.64e15) makes the scan limit overflow to Infinity: `nextCronTime` then walks
// ONE MINUTE at a time forever and the process hangs. `parseInterval` also let
// an overflowed product through when it rounded to Infinity.

test('a huge interval is rejected, never Infinity', () => {
  assert.equal(parseInterval('9'.repeat(400) + 's'), null)
  assert.equal(parseInterval('9999999999999999h'), null)
})

test('a normal interval is still accepted', () => {
  assert.equal(parseInterval('30s'), 30_000)
  assert.equal(parseInterval('2h'), 7_200_000)
})

test('a non-finite fromMs makes nextCronTime give up instead of hanging', () => {
  const t0 = Date.now()
  const r = nextCronTime('0 0 1 1 *', Number.MAX_VALUE)
  assert.equal(r, null)
  assert.ok(Date.now() - t0 < 5000, 'the scan took ' + (Date.now() - t0) + 'ms')
})
