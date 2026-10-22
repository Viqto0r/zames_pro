import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeSends, formatSendEvent } from '../src/send-telemetry.ts'

// `blockMs` is written as a number, but a telemetry file may be hand-edited or
// written by an older build. `summarizeSends` only accepts a NUMBER, so a
// stringified value (`"blockMs":"500"`) is silently dropped from the average —
// /limits then reports 0 for a file that clearly records the block.

test('a stringified blockMs still counts in the average', () => {
  const now = Date.now()
  const at = new Date(now - 60_000).toISOString()
  const events = [
    {
      at,
      provider: 'x',
      intervalMs: 0,
      waitedMs: 0,
      outcome: 'rate_limit',
      blockMs: '500',
    },
    { at, provider: 'x', intervalMs: 0, waitedMs: 0, outcome: 'ok' },
  ] as never
  const s = summarizeSends(events, now)
  assert.equal(s.avgBlockMs, 500)
})

test('the writer still emits a number', () => {
  const line = formatSendEvent({
    at: new Date().toISOString(),
    provider: 'x',
    intervalMs: 0,
    waitedMs: 0,
    outcome: 'rate_limit',
    blockMs: 500,
  })
  assert.match(line, /"blockMs":500/)
})
