import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAnswer,
  extractTokenUsage,
  isFinishedWithoutAnswer,
  isQuotaExhaustedText,
  isGuestLimitText,
  isContextLimitText,
} from '../src/glm-net-capture.ts'

const NL = String.fromCharCode(10)

// test/glm-net-capture.test.ts pins the LIVE fixtures. The decoder below it
// has several tolerated shapes that no fixture reaches, and each one is a
// silent data-loss path if it breaks: an envelope not unwrapped, an OpenAI
// fallback that stops accepting `message`, a tool phase that leaks into the
// answer, a usage count read from the wrong place. Pin the SHAPES here.

function sse(...chunks: unknown[]): string {
  return chunks.map((c) => 'data: ' + JSON.stringify(c) + NL).join('')
}

function completion(data: Record<string, unknown>): unknown {
  return { type: 'chat:completion', data }
}

test('an OpenAI-compatible delta.content is an answer (fallback shape)', () => {
  const body = sse({ choices: [{ delta: { content: 'He' } }] })
  assert.equal(extractAnswer(body), 'He')
})

// The `message` shape is the NON-streamed OpenAI reply (`choices[].message`).
// It must be decoded exactly like `delta`, or a proxied reply reads as empty
// and the turn is treated as truncated.
test('an OpenAI-compatible message.content is an answer too', () => {
  const body = sse({ choices: [{ message: { content: 'whole reply' } }] })
  assert.equal(extractAnswer(body), 'whole reply')
})

// In the SSE path a choice with neither `delta` nor `message` is SKIPPED (the
// OpenAI fallback there requires one of the two). Only the JSON path below
// reads the choice itself, and that is the shape which is pinned.
test('an SSE choice without delta/message is skipped', () => {
  assert.equal(
    extractAnswer(sse({ choices: [{ content: 'bare choice' }] })),
    '',
  )
})

test('a JSON choice WITHOUT delta/message is read as the choice itself', () => {
  const body = JSON.stringify({ choices: [{ content: 'bare choice' }] })
  assert.equal(extractAnswer(body), 'bare choice')
})

test('a non-object OpenAI choice is skipped, the next one still counts', () => {
  const body = sse({ choices: [null, 'x', { delta: { content: 'kept' } }] })
  assert.equal(extractAnswer(body), 'kept')
})

test('a tool phase in the OpenAI shape never reaches the answer', () => {
  const body = sse(
    { choices: [{ delta: { content: 'GLMTOOL', phase: 'tool_call' } }] },
    { choices: [{ delta: { content: 'GLMTHINK', phase: 'reasoning' } }] },
    { choices: [{ delta: { content: 'visible' } }] },
  )
  assert.equal(extractAnswer(body), 'visible')
})

test('a nested phase OTHER than answer is skipped by pickAnswer', () => {
  const body = JSON.stringify({
    data: { phase: 'thinking', delta_content: 'secret reasoning' },
  })
  assert.equal(extractAnswer(body), '')
})

test('a plain JSON reply is unwrapped from the chat:completion envelope', () => {
  const body = JSON.stringify(
    completion({ phase: 'answer', delta_content: 'json answer' }),
  )
  assert.equal(extractAnswer(body), 'json answer')
})

test('pickAnswer joins an ARRAY of chunks and skips empty nodes', () => {
  const body = JSON.stringify([
    null,
    'a',
    { delta_content: 'b' },
    { phase: 'answer', data: { delta_content: 'c' } },
  ])
  assert.equal(extractAnswer(body), 'abc')
})

test('top-level content/text/answer keys are the last JSON fallback', () => {
  assert.equal(extractAnswer(JSON.stringify({ content: 'c' })), 'c')
  assert.equal(extractAnswer(JSON.stringify({ text: 't' })), 't')
  assert.equal(extractAnswer(JSON.stringify({ answer: 'a' })), 'a')
  assert.equal(extractAnswer(JSON.stringify({ other: 'x' })), '')
})

test('broken/plain bodies are not answers and not finished', () => {
  assert.equal(extractAnswer('not json'), '')
  assert.equal(extractAnswer('[DONE]'), '')
  assert.equal(extractAnswer('data: [DONE]'), '')
  assert.equal(isFinishedWithoutAnswer('not json'), false)
})

test('a non-streamed usage sits inside the SAME envelope', () => {
  const body = JSON.stringify(
    completion({ phase: 'done', usage: { prompt_tokens: 4321 } }),
  )
  assert.equal(extractTokenUsage(body), 4321)
})

test('total_tokens is the fallback when prompt_tokens is missing', () => {
  const body = sse(completion({ usage: { total_tokens: 99 } }))
  assert.equal(extractTokenUsage(body), 99)
})

test('a bad count falls back instead of poisoning the counter', () => {
  const body = sse(
    completion({ usage: { prompt_tokens: -5, total_tokens: 77 } }),
    completion({ usage: { prompt_tokens: 'x', total_tokens: NaN } }),
  )
  assert.equal(extractTokenUsage(body), 77)
  assert.equal(extractTokenUsage('no usage at all'), null)
  assert.equal(extractTokenUsage(''), null)
})

test('a top-level usage (no envelope) is still read', () => {
  const body = sse({ usage: { prompt_tokens: 11 } })
  assert.equal(extractTokenUsage(body), 11)
  const json = JSON.stringify({ usage: { prompt_tokens: 12 } })
  assert.equal(extractTokenUsage(json), 12)
})

test('a done chunk is `done: true` OR the `done` phase', () => {
  assert.equal(
    isFinishedWithoutAnswer(
      sse(completion({ done: true }), completion({ phase: 'done' })),
    ),
    true,
  )
  assert.equal(
    isFinishedWithoutAnswer(sse(completion({ phase: 'other' }))),
    false,
  )
  assert.equal(
    isFinishedWithoutAnswer(
      sse(
        completion({ phase: 'done' }),
        completion({ phase: 'answer', delta_content: 'x' }),
      ),
    ),
    false,
  )
})

test('an OpenAI answer after the done chunk still counts as answered', () => {
  const body = sse(completion({ phase: 'done' }), {
    choices: [{ delta: { content: 'late' } }],
  })
  assert.equal(isFinishedWithoutAnswer(body), false)
})

// CONTRAST worth knowing: isFinishedWithoutAnswer asks `extractFromSse() === ''`
// (byte-exact), so a SPACES-only chunk counts as content, while
// hasAnswerContent (the classifier guard) trims. A stream of nothing but
// spaces therefore reports `false` here: it is pinned, not corrected.
test('a spaces-only answer chunk counts as content for the finish check', () => {
  const body = sse(
    completion({ phase: 'done' }),
    completion({ phase: 'answer', delta_content: '   ' }),
  )
  assert.equal(isFinishedWithoutAnswer(body), false)
})

test('an EMPTY answer chunk plus done is a finished turn with no answer', () => {
  const body = sse(
    completion({ phase: 'done' }),
    completion({ phase: 'answer', delta_content: '' }),
  )
  assert.equal(isFinishedWithoutAnswer(body), true)
})

test('quota exhaustion is an error payload, not a word in an answer', () => {
  const err = sse({ type: 'error', code: 'insufficient_quota' })
  assert.equal(isQuotaExhaustedText(err), true)
  assert.equal(
    isQuotaExhaustedText(sse({ type: 'error', content: 'quota exceeded' })),
    true,
  )
  const prose = sse(
    completion({
      phase: 'answer',
      delta_content: 'handle insufficient_quota by backing off',
    }),
  )
  assert.equal(isQuotaExhaustedText(prose), false)
  assert.equal(isQuotaExhaustedText(''), false)
})

test('a guest limit needs an EXPLICIT sentence or an error payload', () => {
  assert.equal(
    isGuestLimitText(sse({ type: 'error', content: 'guest' })),
    false,
  )
  assert.equal(isGuestLimitText('guest-123@guest.com'), false)
  assert.equal(
    isGuestLimitText(
      sse({ type: 'error', content: 'guest daily limit reached' }),
    ),
    true,
  )
  assert.equal(isGuestLimitText('please log in to continue'), true)
  assert.equal(isGuestLimitText(''), false)
})

test('a context limit in a normal answer is not a refusal', () => {
  const prose = sse(
    completion({
      phase: 'answer',
      delta_content: 'start a new chat when full',
    }),
  )
  assert.equal(isContextLimitText(prose), false)
  assert.equal(
    isContextLimitText(
      sse({ type: 'error', content: 'maximum context length' }),
    ),
    true,
  )
  assert.equal(isContextLimitText(''), false)
})
