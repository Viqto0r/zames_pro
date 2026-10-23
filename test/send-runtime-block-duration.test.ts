import test from 'node:test'
import assert from 'node:assert/strict'
import { applySendEvent } from '../src/send-throttle.ts'
import { SendRuntime } from '../src/send-runtime.ts'

// A rate-limit event used to be stamped with `blockMs` = (block start -> now)
// while the block was still OPEN, and `onBlockLifted` then wrote the REAL
// duration of the same block. `/limits` averages over every event carrying
// `blockMs`, so one block produced TWO samples (and the first was a partial
// lower bound) — the "average block" doubled its sample size. Only the lift is
// a measurement; a refusal just marks the block start.
test('a rate-limit event does not claim a block duration', () => {
  const cfg = {
    baseMs: 0,
    rateLimitWaitMs: 1000,
    windowMs: 600_000,
    budget: Number.POSITIVE_INFINITY,
    recoverAfter: 3,
    maxMs: 60_000,
    limitFloorMs: 2000,
  }
  // The state machine still tracks the block START (the lift measures from it).
  const state = applySendEvent(
    {
      intervalMs: 0,
      okStreak: 0,
      blocked: false,
      blockedAt: 0,
      forcedWaitMs: 0,
      recent: [],
    },
    {
      at: new Date(1_000_000).toISOString(),
      provider: 'glm',
      intervalMs: 0,
      waitedMs: 0,
      outcome: 'rate_limit',
    },
    cfg,
    1_000_000,
  )
  assert.equal(state.blockedAt, 1_000_000, 'the block start must be kept')
})

test('the same block is measured once, not per event', async (t) => {
  const fs = await import('node:fs')
  const { readSendEvents } = await import('../src/send-telemetry.ts')
  const { makeTmpDir } = await import('./tmp-dir.ts')
  const dir = await makeTmpDir(t, 'zames-blockonce-')
  let now = 1_000_000
  const rt = new SendRuntime({
    provider: 'glm',
    baseMs: 0,
    rateLimitWaitMs: 1000,
    adaptive: true,
    telemetry: true,
    logsDir: dir,
    now: () => now,
  })
  rt.onSend()
  rt.onOutcome('rate_limit')
  now += 120_000
  rt.onBlockLifted()
  const measured = readSendEvents(dir, 'glm').filter(
    (e) => typeof e.blockMs === 'number',
  )
  assert.equal(measured.length, 1, 'one block = one measurement')
  assert.equal(measured[0].blockMs, 120_000)
  assert.ok(fs.existsSync(dir))
})
