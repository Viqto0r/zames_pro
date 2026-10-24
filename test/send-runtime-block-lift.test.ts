// The measured BLOCK duration of a rate limit is written by onBlockLifted().
// That call is the ONLY producer of `blockMs` besides the zero-length guard,
// and a real provider's ask() never calls it: a rate limit is retried IN
// PLACE, the retry succeeds, and onOutcome('ok') has ALREADY cleared
// `blockedAt` by then. So /limits kept reporting "average block: 0s" for a
// provider whose telemetry has rate-limit events. When a send succeeds and the
// runtime still knows the block start, that success IS the lift: record the
// duration right there (once — a second success must not re-measure it).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SendRuntime } from '../src/send-runtime.ts'
import { readSendEvents } from '../src/send-telemetry.ts'
import { makeTmpDir } from './tmp-dir.ts'

test('a success after a rate limit records the block duration', async (t) => {
  const dir = await makeTmpDir(t, 'zames-blocklift-')
  let now = 1_000_000
  const rt = new SendRuntime({
    provider: 'glm',
    baseMs: 0,
    rateLimitWaitMs: 60_000,
    adaptive: true,
    telemetry: true,
    logsDir: dir,
    now: () => now,
  })
  rt.onSend()
  rt.onOutcome('rate_limit')
  now += 60_000
  rt.onSend()
  rt.onOutcome('ok')
  const measured = readSendEvents(dir, 'glm').filter(
    (e) => typeof e.blockMs === 'number',
  )
  assert.equal(measured.length, 1, 'one block = one measurement')
  assert.equal(measured[0].blockMs, 60_000)
  // A SECOND success must not measure the same (already lifted) block again.
  now += 1000
  rt.onSend()
  rt.onOutcome('ok')
  const again = readSendEvents(dir, 'glm').filter(
    (e) => typeof e.blockMs === 'number',
  )
  assert.equal(again.length, 1, 'the lifted block is not measured twice')
})

test('the block duration is recorded with the adaptive throttle off too', async (t) => {
  const dir = await makeTmpDir(t, 'zames-blocklift2-')
  let now = 1_000_000
  const rt = new SendRuntime({
    provider: 'deepseek',
    baseMs: 1000,
    rateLimitWaitMs: 5000,
    adaptive: false,
    telemetry: true,
    logsDir: dir,
    now: () => now,
  })
  rt.onSend({})
  rt.onOutcome('rate_limit')
  now += 30_000
  rt.onSend({})
  rt.onOutcome('ok')
  const measured = readSendEvents(dir, 'deepseek').filter(
    (e) => typeof e.blockMs === 'number',
  )
  assert.equal(measured.length, 1)
  assert.equal(measured[0].blockMs, 30_000)
})
