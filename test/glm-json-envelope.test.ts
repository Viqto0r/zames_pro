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
