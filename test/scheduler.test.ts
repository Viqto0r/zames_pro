import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseInterval,
  formatInterval,
  formatJobLine,
  parseCron,
  cronMatches,
  nextCronTime,
  Scheduler,
} from '../src/scheduler.ts'

test('parseInterval: s/m/h and bare seconds', () => {
  assert.equal(parseInterval('30'), 30_000)
  assert.equal(parseInterval('30s'), 30_000)
  assert.equal(parseInterval('5m'), 300_000)
  assert.equal(parseInterval('2h'), 7_200_000)
  assert.equal(parseInterval('1 hour'), 3_600_000)
})

test('parseInterval: rejects garbage and non-positive', () => {
  assert.equal(parseInterval(''), null)
  assert.equal(parseInterval('0'), null)
  assert.equal(parseInterval('-5m'), null)
  assert.equal(parseInterval('abc'), null)
  assert.equal(parseInterval('5x'), null)
})

test('formatInterval: shortest human form', () => {
  assert.equal(formatInterval(30_000), '30s')
  assert.equal(formatInterval(300_000), '5m')
  assert.equal(formatInterval(7_200_000), '2h')
  // A cron job with no computable next fire renders neutrally, not "Infinity".
  assert.equal(formatInterval(Number.POSITIVE_INFINITY), '-')
  assert.equal(formatInterval(Number.NaN), '-')
})

test('parseCron: rejects a wrong field count or bad values', () => {
  assert.equal(parseCron('* * * *'), null)
  assert.equal(parseCron('61 * * * *'), null)
  assert.equal(parseCron('* 24 * * *'), null)
  // A valid 5-field expression parses.
  assert.notEqual(parseCron('* * * * *'), null)
})

test('cronMatches: minute/hour/day matching', () => {
  // 2026-01-05 is a Monday.
  const monday = new Date(2026, 0, 5, 9, 30, 0)
  assert.equal(cronMatches('30 9 * * *', monday), true)
  assert.equal(cronMatches('31 9 * * *', monday), false)
  assert.equal(cronMatches('30 9 * * 1', monday), true) // Monday = 1
  assert.equal(cronMatches('30 9 * * 0', monday), false)
  // Sunday accepts both 0 and 7.
  const sunday = new Date(2026, 0, 4, 9, 30, 0)
  assert.equal(cronMatches('30 9 * * 0', sunday), true)
  assert.equal(cronMatches('30 9 * * 7', sunday), true)
})

test('cronMatches: */step ranges', () => {
  assert.equal(
    cronMatches('*/15 * * * *', new Date(2026, 0, 5, 9, 15, 0)),
    true,
  )
  assert.equal(
    cronMatches('*/15 * * * *', new Date(2026, 0, 5, 9, 16, 0)),
    false,
  )
})

test('nextCronTime: strictly in the future', () => {
  const from = new Date(2026, 0, 5, 9, 30, 30).getTime()
  const next = nextCronTime('0 * * * *', from)
  assert.ok(next !== null && next > from)
  const d = new Date(next as number)
  assert.equal(d.getMinutes(), 0)
  assert.equal(d.getSeconds(), 0)
})

test('Scheduler: addLoop fires at once, then every interval', () => {
  const s = new Scheduler()
  const now = 1000
  s.addLoop(60_000, 'ping', now)
  assert.equal(s.count(), 1)
  // The FIRST fire is due immediately (write once, the loop starts working).
  const first = s.due(now)
  assert.equal(first.length, 1)
  assert.equal(first[0].task, 'ping')
  // Rescheduled for the next period, not due again immediately.
  assert.equal(s.due(now).length, 0)
  assert.equal(s.due(now + 60_000 - 1).length, 0)
  assert.equal(s.due(now + 60_000).length, 1)
})

test('Scheduler: a loop that fell behind coalesces missed fires', () => {
  const s = new Scheduler()
  s.addLoop(1000, 'tick', 0)
  // Jump far ahead: exactly ONE fire, nextAt advanced past now.
  const fired = s.due(10_000)
  assert.equal(fired.length, 1)
  assert.equal(s.due(10_000).length, 0)
})

test('Scheduler: remove and clear', () => {
  const s = new Scheduler()
  const a = s.addLoop(1000, 'a', 0)
  s.addLoop(1000, 'b', 0)
  assert.equal(s.count(), 2)
  assert.equal(s.remove(a.id), true)
  assert.equal(s.remove(999), false)
  assert.equal(s.count(), 1)
  assert.equal(s.clear(), 1)
  assert.equal(s.count(), 0)
})

test('Scheduler: addCron computes nextAt', () => {
  const now = new Date(2026, 0, 5, 9, 30, 0).getTime()
  const s = new Scheduler()
  const job = s.addCron('0 12 * * *', 'noon', now)
  assert.ok(job)
  assert.ok((job as { nextAt: number }).nextAt > now)
  assert.equal(s.addCron('bad expr', 'x', now), null)
})

test('formatJobLine renders loop and cron jobs', () => {
  const now = 1_000_000
  const loop = {
    id: 1,
    kind: 'loop' as const,
    task: 'run tests',
    intervalMs: 600_000,
    nextAt: now + 300_000,
    createdAt: now,
  }
  const line = formatJobLine(loop, now)
  assert.ok(line.includes('#1'))
  assert.ok(line.includes('every 10m'))
  assert.ok(line.includes('next ~5m'))
  assert.ok(line.includes('run tests'))
  const cron = {
    id: 2,
    kind: 'cron' as const,
    task: 'morning',
    cron: '0 9 * * *',
    nextAt: now + 3_600_000,
    createdAt: now,
  }
  assert.ok(formatJobLine(cron, now).includes('0 9 * * *'))
})

// A cron job whose next fire could NOT be computed keeps nextAt = Infinity.
// `Math.max(0, Infinity - now)` is Infinity, so the listing printed
// "next ~-" (formatInterval maps a non-finite value to '-') — a job that
// will never run looked like a normal scheduled one.
test('formatJobLine marks a job that can never fire', () => {
  const now = 1_000_000
  const dead = {
    id: 3,
    kind: 'cron' as const,
    task: 'never',
    cron: '0 0 31 2 *',
    nextAt: Number.POSITIVE_INFINITY,
    createdAt: now,
  }
  const line = formatJobLine(dead, now)
  assert.ok(!line.includes('next ~-'), line)
  assert.ok(line.includes('NEVER fires'), line)
})

// Beyond 2^31-1 ms (~24.8 days) setInterval clamps its delay and Node prints
// "TimeoutOverflowWarning: … does not fit into a 32-bit signed integer" on
// every tick, while the scheduler computes a fire time weeks away that the
// timer can never reach. A huge interval is a typo, not a schedule.
test('parseInterval rejects an interval that overflows a 32-bit timer', () => {
  assert.equal(parseInterval('99999h'), null)
  assert.equal(parseInterval('30d'), null) // a unit we do not support
  // The last representable value is still accepted.
  assert.equal(parseInterval('596h'), 596 * 3_600_000)
})

// A ranged field WITH a step must respect the step. `1-10/3` means
// 1,4,7,10 — the classic cron trap is `*/2`-style patterns whose step is
// silently ignored. `hi > max` in a step range is ALSO valid cron (`0-59/15`
// is fine) but an out-of-range value without a step is not.
test('parseCron: a step inside a range field is honoured', () => {
  const c = parseCron('1-10/3 * * * *')
  assert.ok(c)
  assert.deepEqual(
    [...c.minute].sort((a, b) => a - b),
    [1, 4, 7, 10],
  )
})

// `N/step` (a start with a step, no range) is valid cron: from N to the field
// maximum. The parser required a range and rejected it, so a perfectly normal
// `5/10 * * * *` expression was refused with the usage message.
test('parseCron: N/step means from N to the field max', () => {
  const c = parseCron('5/20 * * * *')
  assert.ok(c, 'N/step must be accepted')
  assert.deepEqual(
    [...c.minute].sort((a, b) => a - b),
    [5, 25, 45],
  )
})

// An out-of-range endpoint inside a step range is still a typo: `0-70/5`.
test('parseCron: an out-of-range step range is rejected', () => {
  assert.equal(parseCron('0-70/5 * * * *'), null)
})

// Standard cron ORs day-of-month and day-of-week when BOTH are restricted:
// `0 9 1 * 1` fires at 9:00 on the 1st of the month OR on any Monday. The
// parser ANDed them, so the job fired only when the 1st happened to be a
// Monday — the operator's "first of the month and every Monday" reminder
// silently ran a few times a year.
test('cronMatches ORs restricted day-of-month and day-of-week', () => {
  // 2026-06-01 is a Monday; 2026-06-02 is a Tuesday (the 2nd).
  assert.equal(cronMatches('0 9 1 * 1', new Date(2026, 5, 1, 9, 0)), true)
  assert.equal(cronMatches('0 9 1 * 1', new Date(2026, 5, 2, 9, 0)), false)
  // A Monday that is NOT the 1st must still fire.
  const monday = new Date(2026, 5, 8, 9, 0)
  assert.equal(monday.getDay(), 1)
  assert.equal(monday.getDate(), 8)
  assert.equal(cronMatches('0 9 1 * 1', monday), true)
  // With BOTH fields unrestricted the rule is a plain AND (every day).
  assert.equal(cronMatches('0 9 * * *', new Date(2026, 5, 2, 9, 0)), true)
})
