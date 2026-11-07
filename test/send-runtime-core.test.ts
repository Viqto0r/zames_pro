import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTmpDirSync } from './tmp-dir.ts'
import { SendRuntime } from '../src/send-runtime.ts'
import { readSendEvents } from '../src/send-telemetry.ts'

// SendRuntime is the ONE place where a provider's send events become
// telemetry and (for GLM) an adaptive interval. The block-duration edge cases
// have three files of their own; this one pins the CORE: the interval choice,
// the wait math, the pending-event lifecycle and the telemetry switch.

function rt(over: Record<string, unknown> = {}): {
  rt: SendRuntime
  logs: string
  advance: (ms: number) => void
} {
  let t = 1_000_000
  const logs = makeTmpDirSync({ on: () => {} }, 'rt-default-')
  const r = new SendRuntime({
    provider: 'test',
    baseMs: 1000,
    rateLimitWaitMs: 5000,
    adaptive: false,
    telemetry: false,
    logsDir: logs,
    now: () => t,
    ...over,
  })
  return {
    rt: r,
    logs,
    advance: (ms: number) => {
      t += ms
    },
  }
}

test('a non-adaptive runtime reports the configured base interval', () => {
  const { rt: r } = rt()
  assert.equal(r.intervalMs(), 1000)
})

test('an adaptive runtime reports the state interval', () => {
  const { rt: r } = rt({ adaptive: true })
  assert.equal(r.intervalMs(), r.state.intervalMs)
})

test('the first send waits nothing, the second waits the remaining gap', () => {
  const { rt: r, advance } = rt()
  assert.equal(r.waitMs(), 0)
  r.onSend()
  r.onOutcome('ok')
  advance(300)
  assert.equal(r.waitMs(), 700)
  advance(1000)
  assert.equal(r.waitMs(), 0)
})

test('onSend records the wait since the previous send', (t) => {
  const dir = makeTmpDirSync(t, 'rt-wait-')
  const { rt: r, advance } = rt({ logsDir: dir, telemetry: true })
  r.onSend()
  r.onOutcome('ok')
  advance(400)
  r.onSend()
  const events = readSendEvents(dir, 'test')
  assert.equal(events.length, 1)
  assert.equal(events[0].waitedMs, 0)
  assert.equal(events[0].outcome, 'ok')
})

test('onOutcome without a pending send is a no-op', (t) => {
  const dir = makeTmpDirSync(t, 'rt-nop-')
  const { rt: r } = rt({ logsDir: dir, telemetry: true })
  r.onOutcome('ok')
  assert.equal(readSendEvents(dir, 'test').length, 0)
  // A second outcome for the same send is ignored too (one line per send).
  r.onSend()
  r.onOutcome('ok')
  r.onOutcome('ok')
  assert.equal(readSendEvents(dir, 'test').length, 1)
})

test('the telemetry switch OFF writes nothing and ON writes one line', (t) => {
  const dir = makeTmpDirSync(t, 'rt-')
  const off = rt({ logsDir: dir, telemetry: false })
  off.rt.onSend({ model: 'm' })
  off.rt.onOutcome('ok')
  assert.equal(readSendEvents(dir, 'test').length, 0)

  const on = rt({ logsDir: dir, telemetry: true })
  on.rt.onSend({ model: 'm', thinking: true })
  on.rt.onOutcome('rate_limit', { errorText: 'slow', retryAfterMs: 900 })
  const events = readSendEvents(dir, 'test')
  assert.equal(events.length, 1)
  assert.equal(events[0].model, 'm')
  assert.equal(events[0].thinking, true)
  assert.equal(events[0].outcome, 'rate_limit')
  assert.equal(events[0].errorText, 'slow')
  assert.equal(events[0].retryAfterMs, 900)
})

test('a long error text is clipped to 300 characters', (t) => {
  const dir = makeTmpDirSync(t, 'rt-clip-')
  const { rt: r } = rt({ logsDir: dir, telemetry: true })
  r.onSend()
  r.onOutcome('busy', { errorText: 'x'.repeat(500) })
  const events = readSendEvents(dir, 'test')
  assert.equal(events[0].errorText?.length, 300)
})

test('a rate limit with the adaptive throttle off still marks the block', () => {
  const { rt: r } = rt({ adaptive: false })
  r.onSend()
  r.onOutcome('rate_limit')
  assert.equal(r.state.blocked, true)
  assert.ok(r.state.blockedAt > 0)
})

test('a second rate limit does not move the block start', () => {
  const { rt: r, advance } = rt({ adaptive: false })
  r.onSend()
  r.onOutcome('rate_limit')
  const start = r.state.blockedAt
  advance(2000)
  r.onSend()
  r.onOutcome('rate_limit')
  assert.equal(r.state.blockedAt, start)
})
