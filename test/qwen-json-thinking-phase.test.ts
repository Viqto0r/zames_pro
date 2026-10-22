import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractFromJson } from '../src/qwen-net-capture.ts'

// `pickAnswer` walks a plain JSON body looking for the answer. The THINK guard
// is applied in the `choices[]` branch only — but a reply can also arrive as a
// top-level object with `phase: 'thinking_summary'` and `content` (the SSE
// stream uses exactly that phase name, and the history/plain-JSON shape is the
// same object one level deeper). Such a body was returned as the ANSWER, so a
// reasoning summary was restored/consumed as the model's reply.
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
