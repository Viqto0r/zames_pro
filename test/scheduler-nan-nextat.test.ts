import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Scheduler } from '../src/scheduler.ts'

// A job whose `nextAt` is NOT a finite number (a restored/hand-edited job, a
// NaN from a broken date) matched every branch of `due()`: `NaN > now` is
// false, so it was reported as due on EVERY 1-second tick, and the reschedule
// arithmetic kept it NaN forever. The scheduler busy-looped that job — the
// same failure the zero-interval guard was written to prevent.

test('a loop with a NaN nextAt does not fire on every tick', () => {
  const s = new Scheduler()
  const j = s.addLoop(1000, 'x', 0)
  ;(j as unknown as { nextAt: number }).nextAt = Number.NaN
  let fired = 0
  for (let i = 0; i < 5; i++) fired += s.due(1000 + i * 1000).length
  // The first tick RESETS the broken stamp and fires nothing; from then on the
  // job fires on its normal cadence — never once per tick.
  assert.equal(fired, 4, 'the job fired ' + fired + ' times')
  assert.ok(
    Number.isFinite(s.list()[0].nextAt),
    'nextAt stayed NaN: ' + s.list()[0].nextAt,
  )
})

test('a cron job with a NaN nextAt does not fire on every tick', () => {
  const s = new Scheduler()
  const j = s.addCron('* * * * *', 'c', 0)
  assert.ok(j)
  ;(j as unknown as { nextAt: number }).nextAt = Number.NaN
  let fired = 0
  for (let i = 0; i < 5; i++) fired += s.due(1000 + i * 1000).length
  assert.ok(fired <= 1, 'the cron job fired ' + fired + ' times')
})
