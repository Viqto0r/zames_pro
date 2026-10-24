// A loop job with `intervalMs = 0` (a hand-edited/restored schedule, an old
// format) makes `due()` take the `intervalMs > 0` branch never, and the `cron`
// branch neither — so `nextAt` is NEVER advanced. The job then fires on EVERY
// 1-second tick forever: the scheduler busy-loops, flooding the queue with the
// same task.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Scheduler } from '../src/scheduler.ts'

test('a loop with a zero interval does not fire on every tick', () => {
  const s = new Scheduler()
  const now = 1_000_000
  s.addLoop(0, 'x', now)
  const first = s.due(now)
  assert.equal(first.length, 1, 'the first fire is expected')
  const again = s.due(now + 1000)
  assert.equal(again.length, 0, 'the job must not fire again one tick later')
  const later = s.due(now + 60_000)
  assert.equal(later.length, 0, 'and it stays quiet')
})

test('a normal loop still reschedules (control)', () => {
  const s = new Scheduler()
  const now = 1_000_000
  s.addLoop(60_000, 'x', now)
  assert.equal(s.due(now).length, 1)
  assert.equal(s.due(now + 1000).length, 0)
  assert.equal(s.due(now + 60_000).length, 1)
})
