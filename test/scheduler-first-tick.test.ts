import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Scheduler } from '../src/scheduler.ts'

// `/loop 30m <task>` is meant to start working IMMEDIATELY ("write once, the
// cycle runs by itself"), then repeat every 30m. The first fire used to be
// scheduled `now + intervalMs` away — half an hour of silence right after the
// command, which read as "the loop did nothing". The first tick is now due at
// once (nextAt = now); every later tick keeps the interval.

test('addLoop fires the FIRST tick immediately, then every interval', () => {
  const s = new Scheduler()
  const now = 1_000_000
  const job = s.addLoop(30 * 60_000, 'tick', now)
  assert.equal(job.nextAt, now, 'the first tick must be due at once')

  // The very next tick (same `now`) sees it due — not 30 minutes later.
  const fired = s.due(now)
  assert.equal(fired.length, 1)
  assert.equal(fired[0].task, 'tick')

  // After the fire the job is rescheduled one FULL interval ahead, so the
  // immediate first run does not turn the loop into a busy loop.
  assert.equal(s.due(now).length, 0)
  assert.equal(s.due(now + 30 * 60_000 - 1).length, 0)
  assert.equal(s.due(now + 30 * 60_000).length, 1)
})

test('two loops added at different times each start at once', () => {
  const s = new Scheduler()
  const a = s.addLoop(60_000, 'a', 1_000)
  const b = s.addLoop(60_000, 'b', 2_000)
  assert.equal(a.nextAt, 1_000)
  assert.equal(b.nextAt, 2_000)
  assert.deepEqual(
    s.due(2_000).map((j) => j.task),
    ['a', 'b'],
  )
})
