import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isContextLimitText as qwenCtx } from '../src/qwen-net-capture.ts'
import { isContextLimitText as glmCtx } from '../src/glm-net-capture.ts'

// Every backend can run out of context. The recovery is the same everywhere
// (onContextLimit -> compaction -> fresh chat), but each provider has its OWN
// SSE shape, so the detector must be provider-aware: it may only fire on a
// NOTICE, never on an answer that happens to talk about context limits.

const qwenErr =
  'event: error\n' +
  'data: {"type":"error","content":"The context length is exceeded."}\n'

const qwenAnswer =
  'data: ' +
  JSON.stringify({
    choices: [
      {
        delta: { content: 'The context length is exceeded for long prompts.' },
        status: 'typing',
      },
    ],
  }) +
  '\n'

const qwenFinish =
  'data: ' +
  JSON.stringify({
    choices: [{ delta: { content: '', status: 'finished' } }],
  }) +
  '\n'

test('qwen: a context-limit error payload is detected', () => {
  assert.equal(qwenCtx(qwenErr), true)
  assert.equal(qwenCtx(qwenErr + qwenFinish), true)
})

test('qwen: a real answer ABOUT the limit is not a notice', () => {
  assert.equal(qwenCtx(qwenAnswer), false)
  assert.equal(qwenCtx(qwenAnswer + qwenFinish), false)
  assert.equal(qwenCtx(''), false)
  assert.equal(qwenCtx('{"choices":[{"delta":{"content":"ok"}}]}'), false)
})

test('glm: a context-limit error payload is detected', () => {
  const err = JSON.stringify({
    type: 'error',
    content: 'Maximum context length is 128000 tokens.',
  })
  assert.equal(glmCtx(err), true)
})

test('glm: a normal answer stream is not a notice', () => {
  const ok =
    'data: ' +
    JSON.stringify({
      type: 'chat:completion',
      data: { delta_content: 'hello', phase: 'answer' },
    }) +
    '\n'
  assert.equal(glmCtx(ok), false)
  const prose =
    'data: ' +
    JSON.stringify({
      type: 'chat:completion',
      data: {
        delta_content: 'The context window is exceeded at 128k tokens.',
        phase: 'answer',
      },
    }) +
    '\n'
  assert.equal(glmCtx(prose), false, 'prose about the limit is an answer')
  assert.equal(glmCtx(''), false)
})
