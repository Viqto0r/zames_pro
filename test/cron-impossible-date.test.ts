import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCron, nextCronTime } from '../src/scheduler.ts'

// `parseCron` validates each FIELD on its own (dom 1-31, month 1-12), so a
// combination that can NEVER occur is accepted: `0 0 31 2 *` (February 31st).
// The job is then created — `addCron` gets `nextCronTime` = null, which the
// caller treats as a usage error, so the operator at least sees a message; but
// the same expression in the DAY rule can also be `0 0 30 2 *` and a job that
// fires only on Feb 30 is a silent dead schedule everywhere the caller does
// not check.
//
// The parser must reject a date that cannot exist.

test('a day-of-month the month never has is rejected', () => {
  assert.equal(parseCron('0 0 31 2 *'), null)
  assert.equal(parseCron('0 0 30 2 *'), null)
  assert.equal(parseCron('0 0 31 4 *'), null)
})

test('a legal date is still accepted', () => {
  assert.ok(parseCron('0 0 31 1 *'))
  assert.ok(parseCron('0 0 29 2 *'))
  assert.ok(parseCron('0 0 * 2 *'))
})

test('the never-firing expression yields no next time', () => {
  assert.equal(nextCronTime('0 0 31 2 *', Date.UTC(2026, 0, 1)), null)
})
