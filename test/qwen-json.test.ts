import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAnswer,
  extractFromJson,
  isRateLimitText,
  isServerBusyText,
} from '../src/qwen-net-capture.ts'

// NON-streamed Qwen replies: one JSON object. Both a wrapper shape and a
// phase-split shape have broken the answer detection (an answer treated as a
// notice, a reasoning summary returned AS the answer), so the JSON cases live
// in one file.

// --- the answer inside a wrapper --------------------------------------------
// The answer can live in a wrapper (`{data:{content}}`) rather than at the top
// level, and `hasAnswerContent()` only looked at `choices[]`. So a nested
// answer was invisible to it: a real rate-limit/busy notice in the SAME body
// then passed the guard and ask() backed off / gave up while the turn actually
// carried a usable answer.
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

// --- the thinking phase ------------------------------------------------------
// `pickAnswer` walks a plain JSON body looking for the answer. The THINK guard
// is applied in the `choices[]` branch only — but a reply can also arrive as a
// top-level object with `phase: 'thinking_summary'` and `content` (the SSE
// stream uses exactly that phase name). Such a body was returned as the
// ANSWER, so a reasoning summary was consumed as the model's reply.
test('a thinking-phase object is not the answer', () => {
  assert.equal(
    extractFromJson(
      JSON.stringify({
        phase: 'thinking_summary',
        content: 'internal reasoning',
      }),
    ),
    '',
  )
  assert.equal(
    extractFromJson(
      JSON.stringify({ data: { phase: 'thinking_summary', content: 'r' } }),
    ),
    '',
  )
})

test('a real answer object is still returned', () => {
  assert.equal(
    extractFromJson(JSON.stringify({ phase: 'answer', content: 'PONG' })),
    'PONG',
  )
  assert.equal(extractFromJson(JSON.stringify({ content: 'hi' })), 'hi')
})
