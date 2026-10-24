// summarizeTranscript() tracks the longest `elapsed` as the session duration.
// The check is `typeof e.elapsed === 'number' && e.elapsed > durationMs`, and
// `Infinity > 0` is true — so one entry with a non-finite elapsed (a clock
// jump, a hand-edited transcript, a broken timer) made /cost report
// `duration: Infinity`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeTranscript } from '../src/commands.ts'

test('a non-finite elapsed does not become the session duration', () => {
  const stats = summarizeTranscript([
    { type: 'user_task', elapsed: 1500 },
    { type: 'tool_call', tool: 'Read', elapsed: Infinity },
    { type: 'tool_call', tool: 'Read', elapsed: -5 },
  ])
  assert.ok(Number.isFinite(stats.durationMs), 'duration: ' + stats.durationMs)
  assert.equal(stats.durationMs, 1500)
})

test('a normal duration is kept (control)', () => {
  const stats = summarizeTranscript([{ type: 'user_task', elapsed: 2000 }])
  assert.equal(stats.durationMs, 2000)
})
