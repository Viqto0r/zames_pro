// A NON-streamed Qwen reply is a single JSON object. The answer can live in a
// wrapper (`{data:{content}}`) rather than at the top level, and
// `hasAnswerContent()` only looked at `choices[]`. So a nested answer was
// invisible to it: a real rate-limit/busy notice in the SAME body then passed
// the guard and ask() backed off / gave up while the turn actually carried a
// usable answer.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAnswer,
  isRateLimitText,
  isServerBusyText,
} from '../src/qwen-net-capture.ts'

test('extractAnswer: an answer nested in a data envelope', () => {
  const body = JSON.stringify({ data: { content: 'nested answer' } })
  assert.equal(extractAnswer(body), 'nested answer')
})

test('a nested answer keeps a limit notice in the body from firing', () => {
  // The body carries real answer text AND the words of a rate-limit notice
  // (the model may quote them). With the answer found, it must NOT be treated
  // as a notice.
  const body = JSON.stringify({
    data: { content: 'The rate limit message says: too many requests' },
  })
  assert.equal(isRateLimitText(body), false)
  assert.equal(isServerBusyText(body), false)
})
