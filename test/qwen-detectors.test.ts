import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRateLimitText } from '../src/qwen-net-capture.ts'

const NL = String.fromCharCode(10)

// `isRateLimitText` first checks for the `quota_limit` CODE — but that check
// runs before the answer-content guard, so a normal ANSWER that MENTIONS
// `quota_limit` (the operator asked how to handle that API error) was taken
// for a rate limit: ask() backed off and re-sent a good turn. Every other
// phrase in the same classifier is guarded by `hasAnswerContent`, and the
// `quota_limit` CODE only means something in an ERROR payload.
test('an answer mentioning quota_limit is not a rate limit', () => {
  const body =
    'data: ' +
    JSON.stringify({
      choices: [
        {
          delta: {
            phase: 'answer',
            content:
              'When the API answers quota_limit you should back off; please try again later.',
          },
        },
      ],
    }) +
    NL
  assert.equal(isRateLimitText(body), false)
})

test('a real quota_limit error is still a rate limit', () => {
  const body = JSON.stringify({
    type: 'error',
    error: { code: 'quota_limit', message: 'high demand' },
  })
  assert.equal(isRateLimitText(body), true)
})
// The Qwen token counter comes straight from the server's `usage` object.
// DeepSeek and GLM already REJECT a negative count (a wrapped int in a proxy
// build, a nonsense payload) and return null, so the context badge keeps the
// last good value. Qwen accepted `input_tokens: -5` as-is: `_lastTokenUsage`
// became negative, the context badge vanished (tokenStatusLevel rejects a
// negative count) and the auto-compact percentage went negative and never
// fired — the same bug already fixed in the other two providers.

import { extractTokenUsage } from '../src/qwen-net-capture.ts'

test('a negative input_tokens is not a context size', () => {
  const body = 'data: ' + JSON.stringify({ usage: { input_tokens: -5 } })
  assert.equal(extractTokenUsage(body), null)
})

test('a negative total_tokens fallback is not a context size', () => {
  const body = 'data: ' + JSON.stringify({ usage: { total_tokens: -9 } }) + NL
  assert.equal(extractTokenUsage(body), null)
})

test('a negative plain-JSON usage is not a context size either', () => {
  const body = JSON.stringify({ usage: { input_tokens: -1, total_tokens: -2 } })
  assert.equal(extractTokenUsage(body), null)
})

test('a valid count is still returned', () => {
  const body = 'data: ' + JSON.stringify({ usage: { input_tokens: 42 } })
  assert.equal(extractTokenUsage(body), 42)
})
import { isFinishedWithoutAnswer } from '../src/qwen-net-capture.ts'

// Qwen's stream ends with a chunk whose `status` sits on the CHOICE, not on
// the `delta` (see the format comment at the top of qwen-net-capture.ts:
// `"status":"finished","phase":"answer"` inside `choices[0]`). The detector
// only looked at `delta.status`, so a reasoning-only turn that ended with the
// real final chunk was NOT recognized: `ask()` waited out the whole watchdog
// instead of retrying, and the operator watched a spinner on a dead turn.

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
