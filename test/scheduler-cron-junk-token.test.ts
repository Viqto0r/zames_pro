// A malformed cron list item used to be accepted as a VALID schedule. The
// field parser splits on ',' and calls Number() on each range start; Number('')
// and Number('-5')... well, Number('') is 0, so `1,,2` silently meant {0,1,2}
// and `1,` meant {0,1}. Worse, `-5` parsed as the RANGE -5..(no end) because
// split('-') yields ['', '5'] -> lo = Number('') = 0, hi = 5, so a typo like
// `-5 * * * *` (or `0 9 * * -7`, where the leading minus flipped the whole
// week set to {0..6}) was accepted instead of reported as a bad expression.
// The operator was told the job was added and it fired on the wrong minutes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCron } from '../src/scheduler.ts'

test('an empty list item is rejected, not read as 0', () => {
  assert.equal(parseCron('1,,2 * * * *'), null)
  assert.equal(parseCron('1, * * * *'), null)
  assert.equal(parseCron(',5 * * * *'), null)
})

test('a leading minus is rejected, not read as a range from 0', () => {
  assert.equal(parseCron('-5 * * * *'), null)
  assert.equal(parseCron('0 9 * * -7'), null)
})

test('a trailing minus is rejected', () => {
  assert.equal(parseCron('5- * * * *'), null)
})

test('a multi-dash range is rejected, not truncated', () => {
  assert.equal(parseCron('1-2-3 * * * *'), null)
})

test('the well-formed forms still parse', () => {
  assert.ok(parseCron('1,2 * * * *'))
  assert.ok(parseCron('0 9 * * 5-7'))
  assert.ok(parseCron('*/15 * * * *'))
  assert.ok(parseCron('5/20 * * * *'))
  assert.ok(parseCron('1-10/3 * * * *'))
})
