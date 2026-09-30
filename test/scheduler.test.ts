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

test('Scheduler: addLoop, due, and reschedule', () => {
  const s = new Scheduler()
  s.addLoop(60_000, 'ping', 1000)
  assert.equal(s.count(), 1)
  // Not due before its time.
  assert.equal(s.due(1000).length, 0)
  assert.equal(s.due(60_999).length, 0)
  // Due at exactly nextAt.
  const fired = s.due(61_000)
  assert.equal(fired.length, 1)
  assert.equal(fired[0].task, 'ping')
  // Rescheduled for the next period, not due again immediately.
  assert.equal(s.due(61_000).length, 0)
  assert.equal(s.due(121_000).length, 1)
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
