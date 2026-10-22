import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeSends } from '../src/send-telemetry.ts'

// /limits counts the sends of the last 10/30/60 minutes. The window test was
// `now - t <= ms` — it never checked that the event is in the PAST, so an
// event with a FUTURE timestamp (a clock skew on the machine that wrote the
// log, a hand-edited line, a timezone mistake) counted in EVERY window. One
// such line inflated all three counters of /limits and of the soft-budget
// throttle.
test('an event in the future is not counted in the windows', () => {
  const now = Date.parse('2026-10-22T12:00:00Z')
  const mk = (at: string) =>
    ({
      at,
      provider: 'glm',
      intervalMs: 0,
      waitedMs: 0,
      outcome: 'ok',
    }) as never
  const stats = summarizeSends(
    [mk('2030-01-01T00:00:00Z'), mk('2026-10-22T11:59:00Z')],
    now,
  )
  assert.equal(stats.last10m, 1)
  assert.equal(stats.last30m, 1)
  assert.equal(stats.last60m, 1)
})

test('past events are still counted', () => {
  const now = Date.parse('2026-10-22T12:00:00Z')
  const mk = (at: string) =>
    ({
      at,
      provider: 'glm',
      intervalMs: 0,
      waitedMs: 0,
      outcome: 'ok',
    }) as never
  const stats = summarizeSends(
    [mk('2026-10-22T11:55:00Z'), mk('2026-10-22T11:20:00Z')],
    now,
  )
  assert.equal(stats.last10m, 1)
  assert.equal(stats.last30m, 1)
  assert.equal(stats.last60m, 2)
})
