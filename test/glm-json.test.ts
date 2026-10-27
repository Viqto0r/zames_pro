// A NON-streamed z.ai reply is a single JSON object in the SAME envelope the
// SSE stream uses: `{type:'chat:completion', data:{delta_content, phase}}`.
// extractFromJson() -> pickAnswer() unwraps `delta_content` only at the TOP
// level, so the answer inside `data` was dropped and the whole reply read as
// empty — a non-streamed turn lost its text.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractAnswer } from '../src/glm-net-capture.ts'

test('extractAnswer: a JSON reply in the chat:completion envelope', () => {
  const body = JSON.stringify({
    type: 'chat:completion',
    data: { delta_content: 'Hello there', phase: 'answer' },
  })
  assert.equal(extractAnswer(body), 'Hello there')
})

test('extractAnswer: the thinking phase in the envelope is not the answer', () => {
  const body = JSON.stringify({
    type: 'chat:completion',
    data: { delta_content: 'reasoning', phase: 'thinking' },
  })
  assert.equal(extractAnswer(body), '')
})

test('extractAnswer: a nested JSON body keeps its content', () => {
  const body = JSON.stringify({ data: { content: 'nested text' } })
  assert.equal(extractAnswer(body), 'nested text')
})
// A NON-streamed z.ai reply is one JSON object in the same `chat:completion`
// envelope the SSE stream uses. extractTokenUsage() only looked at `data:`
// lines and at a TOP-LEVEL `usage`, so the counter inside `data.usage` was
// lost and /cost, /status and the context warnings had no number at all.

import { extractTokenUsage } from '../src/glm-net-capture.ts'

test('extractTokenUsage: usage inside the chat:completion envelope', () => {
  const body = JSON.stringify({
    type: 'chat:completion',
    data: { phase: 'done', usage: { prompt_tokens: 42, total_tokens: 50 } },
  })
  assert.equal(extractTokenUsage(body), 42)
})

test('extractTokenUsage: total_tokens is the fallback', () => {
  const body = JSON.stringify({
    type: 'chat:completion',
    data: { usage: { total_tokens: 77 } },
  })
  assert.equal(extractTokenUsage(body), 77)
})

test('extractTokenUsage: the SSE stream still reports its usage', () => {
  const NL = String.fromCharCode(10)
  const body =
    'data: ' +
    JSON.stringify({
      type: 'chat:completion',
      data: { usage: { prompt_tokens: 7 } },
    }) +
    NL
  assert.equal(extractTokenUsage(body), 7)
})

// z.ai reports the prompt size in `usage.prompt_tokens` (fallback
// `total_tokens`). The value becomes `browser._lastTokenUsage`, which feeds
// the context counter, /cost, /status and the auto-compact percentage. A
// NEGATIVE number is a nonsense payload, yet it was returned as-is: the
// counter then rendered a negative context (`tokenStatusLevel` rejects it, so
// the badge vanished while the auto-compact percentage went negative and
// never fired). It must be treated as "no usage", like a non-numeric value.
test('a negative prompt_tokens / total_tokens is not a usage', () => {
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { prompt_tokens: -3 } })),
    null,
  )
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { total_tokens: -1 } })),
    null,
  )
  assert.equal(
    extractTokenUsage(
      JSON.stringify({ data: { usage: { prompt_tokens: -5 } } }),
    ),
    null,
  )
})

test('a real usage is still returned', () => {
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { prompt_tokens: 42 } })),
    42,
  )
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { total_tokens: 7 } })),
    7,
  )
  // Zero is a legitimate (empty prompt) value and must NOT be treated as
  // missing — it is a finite non-negative number.
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { prompt_tokens: 0 } })),
    0,
  )
})
