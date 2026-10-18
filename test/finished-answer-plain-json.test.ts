import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFinishedWithoutAnswer,
  isFinishedWithAnswer,
} from '../src/net-capture.ts'

// `MIN_FINISHED_ANSWER_CHARS` (4) exists to reject a truncated RESPONSE head —
// a lone `{` that DeepSeek sometimes ends a turn with. But the measured length
// came from `extractFromSse`, which reads only `data:` lines: a plain-JSON body
// (or one captured without the SSE framing) measured as 0 even when it carried
// a real SHORT answer (`ok`), so the finished turn was classified as
// FINISHED-WITHOUT-ANSWER and ask() resent the prompt (a duplicate turn).

function plain(content: string): string {
  return JSON.stringify({
    v: {
      response: {
        fragments: [{ type: 'RESPONSE', content }],
        quasi_status: 'FINISHED',
      },
    },
  })
}

test('a short answer in a plain-JSON body counts as answered', () => {
  const body = plain('ok')
  assert.equal(isFinishedWithAnswer(body), true, body)
  assert.equal(isFinishedWithoutAnswer(body), false, body)
})

test('a short answer in an SSE body counts too', () => {
  const body = 'data: ' + plain('ok')
  assert.equal(isFinishedWithAnswer(body), true, body)
})

test('a long answer counts', () => {
  const body = plain('Here is the answer.')
  assert.equal(isFinishedWithAnswer(body), true, body)
  assert.equal(isFinishedWithoutAnswer(body), false, body)
})

test('a truncated RESPONSE head is still "no answer"', () => {
  const body = plain('{')
  assert.equal(isFinishedWithAnswer(body), false, body)
  assert.equal(isFinishedWithoutAnswer(body), true, body)
})

test('a reasoning-only turn is still "no answer"', () => {
  const body = JSON.stringify({
    v: {
      response: {
        fragments: [{ type: 'THINK', content: 'reasoning only, long enough' }],
        quasi_status: 'FINISHED',
      },
    },
  })
  assert.equal(isFinishedWithAnswer(body), false, body)
  assert.equal(isFinishedWithoutAnswer(body), true, body)
})
