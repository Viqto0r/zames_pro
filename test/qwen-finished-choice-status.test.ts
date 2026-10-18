import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFinishedWithoutAnswer } from '../src/qwen-net-capture.ts'

// Qwen's stream ends with a chunk whose `status` sits on the CHOICE, not on
// the `delta` (see the format comment at the top of qwen-net-capture.ts:
// `"status":"finished","phase":"answer"` inside `choices[0]`). The detector
// only looked at `delta.status`, so a reasoning-only turn that ended with the
// real final chunk was NOT recognized: `ask()` waited out the whole watchdog
// instead of retrying, and the operator watched a spinner on a dead turn.

const NL = String.fromCharCode(10)

function sse(...lines: string[]): string {
  return lines.map((l) => 'data: ' + l).join(NL)
}

test('a reasoning-only turn finished on the CHOICE is detected', () => {
  const body = sse(
    JSON.stringify({
      choices: [
        {
          delta: {
            role: 'assistant',
            content: 'reasoning',
            phase: 'thinking_summary',
          },
        },
      ],
    }),
    JSON.stringify({
      choices: [
        {
          status: 'finished',
          delta: { role: 'assistant', content: '', phase: 'answer' },
        },
      ],
    }),
  )
  assert.equal(isFinishedWithoutAnswer(body), true)
})

test('a turn that did answer is not "finished without answer"', () => {
  const body = sse(
    JSON.stringify({
      choices: [
        { delta: { role: 'assistant', content: 'PONG', phase: 'answer' } },
      ],
    }),
    JSON.stringify({
      choices: [{ status: 'finished', delta: { content: '' } }],
    }),
  )
  assert.equal(isFinishedWithoutAnswer(body), false)
})

test('a delta-carried finished status still works', () => {
  const body = sse(
    JSON.stringify({
      choices: [{ delta: { status: 'finished', content: '' } }],
    }),
  )
  assert.equal(isFinishedWithoutAnswer(body), true)
})
