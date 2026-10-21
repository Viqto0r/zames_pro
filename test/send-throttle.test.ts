import { test } from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {
  DEFAULT_THROTTLE,
  initialThrottleState,
  nextWaitMs,
  applySendEvent,
  withBlockDuration,
  type ThrottleConfig,
} from '../src/send-throttle.ts'
import {
  summarizeSends,
  parseSendEvents,
  formatSendEvent,
  rotateSendLogs,
  appendSendEvent,
  readSendEvents,
  type SendEvent,
} from '../src/send-telemetry.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

const cfg: ThrottleConfig = {
  baseMs: 0,
  rateLimitWaitMs: 300_000,
  ...DEFAULT_THROTTLE,
}

const ev = (over: Partial<SendEvent> = {}): SendEvent => ({
  at: new Date(1000).toISOString(),
  provider: 'glm',
  intervalMs: 0,
  waitedMs: 0,
  outcome: 'ok',
  ...over,
})

test('a fresh throttle with base 0 waits nothing', () => {
  const st = initialThrottleState(cfg)
  assert.equal(nextWaitMs(st, 0, 1000), 0)
  assert.equal(nextWaitMs(st, 900, 1000), 0)
})

test('a base interval is respected between sends', () => {
  const st = initialThrottleState({ ...cfg, baseMs: 4000 })
  assert.equal(nextWaitMs(st, 1000, 2000), 3000)
  assert.equal(nextWaitMs(st, 1000, 6000), 0)
})

test('a rate limit uses Retry-After when present, else the pause', () => {
  let st = initialThrottleState(cfg)
  st = applySendEvent(
    st,
    ev({ outcome: 'rate_limit', retryAfterMs: 7000 }),
    cfg,
  )
  assert.equal(st.forcedWaitMs, 7000)
  assert.equal(nextWaitMs(st, 0, 0), 7000)

  let st2 = initialThrottleState(cfg)
  st2 = applySendEvent(st2, ev({ outcome: 'rate_limit' }), cfg)
  assert.equal(st2.forcedWaitMs, 300_000)
})

test('after a limit the interval doubles from a 2 s floor, with a cap', () => {
  let st = initialThrottleState(cfg)
  st = applySendEvent(st, ev({ outcome: 'rate_limit' }), cfg)
  assert.equal(st.intervalMs, 4000)
  st = { ...st, forcedWaitMs: 0 }
  st = applySendEvent(st, ev({ outcome: 'rate_limit' }), cfg)
  assert.equal(st.intervalMs, 8000)
  for (let i = 0; i < 20; i++) {
    st = { ...st, forcedWaitMs: 0 }
    st = applySendEvent(st, ev({ outcome: 'rate_limit' }), cfg)
  }
  assert.equal(st.intervalMs, cfg.maxMs)
})

test('three successes in a row halve the interval, down to the base', () => {
  let st = initialThrottleState({ ...cfg, baseMs: 4000 })
  st.intervalMs = 16000
  for (let i = 0; i < 3; i++)
    st = applySendEvent(st, ev(), { ...cfg, baseMs: 4000 })
  assert.equal(st.intervalMs, 8000)
  for (let i = 0; i < 3; i++)
    st = applySendEvent(st, ev(), { ...cfg, baseMs: 4000 })
  assert.equal(st.intervalMs, 4000)
  for (let i = 0; i < 3; i++)
    st = applySendEvent(st, ev(), { ...cfg, baseMs: 4000 })
  assert.equal(st.intervalMs, 4000)
})

test('a soft budget grows the interval BEFORE a limit', () => {
  const soft: ThrottleConfig = { ...cfg, windowMs: 60_000, budget: 2 }
  let st = initialThrottleState(soft)
  const now = 100_000
  for (let i = 0; i < 4; i++) {
    st = applySendEvent(
      st,
      ev({ at: new Date(now - 1000 * i).toISOString() }),
      soft,
      now,
    )
  }
  assert.ok(st.intervalMs > 0)
  // The window prunes old sends, so the budget is not exceeded forever.
  st = applySendEvent(
    st,
    ev({ at: new Date(now + 10 * 60_000).toISOString() }),
    soft,
    now + 10 * 60_000,
  )
  assert.equal(st.recent.length, 1)
})

test('busy/incomplete do not touch the interval', () => {
  let st = initialThrottleState(cfg)
  st.intervalMs = 5000
  st = applySendEvent(st, ev({ outcome: 'busy' }), cfg)
  assert.equal(st.intervalMs, 5000)
  st = applySendEvent(st, ev({ outcome: 'incomplete' }), cfg)
  assert.equal(st.intervalMs, 5000)
})

test('withBlockDuration records the block length on a rate-limit event', () => {
  const e = withBlockDuration(ev({ outcome: 'rate_limit' }), 1000, 61000)
  assert.equal(e.blockMs, 60000)
  const ok = withBlockDuration(ev(), 1000, 2000)
  assert.equal(ok.blockMs, undefined)
})

test('telemetry: format/parse round-trip skips a broken line', () => {
  const raw = formatSendEvent(ev()) + '\n{broken\n'
  const parsed = parseSendEvents(raw)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].provider, 'glm')
})

test('telemetry: summarizeSends counts windows and averages blocks', () => {
  const now = Date.now()
  const events = [
    ev({ at: new Date(now - 60_000).toISOString() }),
    ev({ at: new Date(now - 20 * 60_000).toISOString() }),
    ev({ at: new Date(now - 40 * 60_000).toISOString() }),
    ev({
      at: new Date(now - 5 * 60_000).toISOString(),
      outcome: 'rate_limit',
      blockMs: 60_000,
    }),
    ev({
      at: new Date(now - 6 * 60_000).toISOString(),
      outcome: 'rate_limit',
      blockMs: 120_000,
    }),
  ]
  const st = summarizeSends(events, now)
  assert.equal(st.last10m, 3)
  assert.equal(st.last30m, 4)
  assert.equal(st.last60m, 5)
  assert.equal(st.rateLimits, 2)
  assert.equal(st.avgBlockMs, 90_000)
})

test('telemetry: append, read and rotate the files', (t) => {
  const dir = makeTmpDirSync(t, 'sends')
  appendSendEvent(dir, ev())
  appendSendEvent(dir, ev({ outcome: 'rate_limit' }))
  const events = readSendEvents(dir, 'glm')
  assert.equal(events.length, 2)
  // Rotation keeps the newest `keep` files.
  for (let i = 0; i < 6; i++) {
    appendSendEvent(dir, ev({ provider: 'p' + i }))
  }
  rotateSendLogs(dir, 3)
  const left = fs.readdirSync(dir).filter((f) => f.startsWith('sends-'))
  assert.ok(left.length <= 3, 'rotation kept ' + left.length + ' files')
})
