// Qwen's network-body classifiers are matched against the RAW body, so the
// phrase `please try again later` (and `try again later`) can appear inside a
// normal ANSWER — the model writing about retry logic. The classifier then
// reported a rate limit / server-busy and ask() backed off (or failed) on a
// perfectly good turn.
//
// The SSE answer chunks are structured: a rate limit / busy notice arrives in
// an ERROR payload (`event: error`, `{"type":"error"...}`) or carries
// `quota_limit`, not as answer text in `choices[].delta.content`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRateLimitText, isServerBusyText } from '../src/qwen-net-capture.ts'

const NL = String.fromCharCode(10)

function answerChunk(text: string): string {
  return (
    'data: ' +
    JSON.stringify({
      choices: [
        { delta: { role: 'assistant', content: text, phase: 'answer' } },
      ],
    })
  )
}

test('a normal answer mentioning a retry phrase is not a rate limit', () => {
  const body =
    answerChunk('I added retry logic: please try again later now works.') + NL
  assert.equal(isRateLimitText(body), false)
  assert.equal(isServerBusyText(body), false)
})

test('a real error payload is still a rate limit', () => {
  const body = [
    'event: error',
    'data: {"type":"error","content":"Too many requests. Please try again later."}',
  ].join(NL)
  assert.equal(isRateLimitText(body), true)
})

test('a real server-busy error payload is still detected', () => {
  const body = [
    'event: error',
    'data: {"type":"error","content":"Service unavailable, try again later."}',
  ].join(NL)
  assert.equal(isServerBusyText(body), true)
})

test('quota_limit is still a rate limit', () => {
  assert.equal(isRateLimitText('data: {"code":"quota_limit"}'), true)
})
