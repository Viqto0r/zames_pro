// A NON-streamed z.ai reply is one JSON object in the same `chat:completion`
// envelope the SSE stream uses. extractTokenUsage() only looked at `data:`
// lines and at a TOP-LEVEL `usage`, so the counter inside `data.usage` was
// lost and /cost, /status and the context warnings had no number at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
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
