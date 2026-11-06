import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextCronTime } from '../src/scheduler.ts'

// The scan walks MINUTES in LOCAL time (`d.setMinutes(d.getMinutes() + 1)`).
// On the autumn DST FALL-BACK an hour repeats, and that arithmetic lands on the
// SAME wall-clock minute twice — so a second occurrence of the repeated hour is
// never reached: a `/cron "45 2 * * *"` created between the two 02:30s jumps a
// whole DAY instead of firing in the repeated hour.
//
// 2026-10-25 Europe/Berlin: 02:00-02:59 CEST (00:00-00:59Z) then 02:00-02:59
// CET (01:00-01:59Z). The bug showed with a job created BETWEEN the two
// 02:45s: the local-minute scan skipped the CET one and fired TOMORROW.
const TZ = 'Europe/Berlin'

test('a fall-back hour does not skip the second occurrence', () => {
  const prev = process.env.TZ
  process.env.TZ = TZ
  try {
    // Created just AFTER the first (CEST) 02:45, 00:50Z: the very next 02:45
    // is the CET one at 01:45Z the SAME day — not tomorrow's.
    const from = new Date('2026-10-25T00:50:00Z').getTime()
    const t = nextCronTime('45 2 * * *', from)
    assert.ok(t !== null, 'no fire time')
    assert.equal(new Date(t).toISOString(), '2026-10-25T01:45:00.000Z')
  } finally {
    if (prev === undefined) delete process.env.TZ
    else process.env.TZ = prev
  }
})
