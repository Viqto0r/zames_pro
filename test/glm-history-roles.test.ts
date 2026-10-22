import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmHistory } from '../src/glm-chats.ts'

// `parseGlmHistory` mapped EVERY role that is not `user`/`human` to the
// assistant. A SYSTEM turn (z.ai's own system prompt) and a TOOL turn (the
// sandbox output of z.ai's agent runtime) were therefore restored as model
// REPLIES — the operator saw their own prompt framework and tool dumps printed
// as if the model had said them. The Qwen parser already drops those roles.
test('parseGlmHistory: system and tool turns are dropped, not shown as answers', () => {
  const msgs = parseGlmHistory({
    messages: [
      { role: 'system', content: 'system prompt', timestamp: 1 },
      { role: 'tool', content: 'tool output', timestamp: 2 },
      { role: 'user', content: 'question', timestamp: 3 },
      { role: 'assistant', content: 'answer', timestamp: 4 },
    ],
  })
  assert.deepEqual(msgs, [
    { role: 'user', text: 'question' },
    { role: 'assistant', text: 'answer' },
  ])
})

test('parseGlmHistory: the `from` field is honoured for the role', () => {
  const msgs = parseGlmHistory({
    messages: [
      { from: 'human', content: 'q', timestamp: 1 },
      { from: 'assistant', content: 'a', timestamp: 2 },
      { from: 'system', content: 'sys', timestamp: 3 },
    ],
  })
  assert.deepEqual(msgs, [
    { role: 'user', text: 'q' },
    { role: 'assistant', text: 'a' },
  ])
})

test('parseGlmHistory: fragments and content_list are used when content is empty', () => {
  const msgs = parseGlmHistory({
    messages: [
      {
        role: 'assistant',
        fragments: [{ type: 'RESPONSE', content: 'from fragments' }],
        timestamp: 1,
      },
      {
        role: 'assistant',
        content_list: [
          { phase: 'thinking', content: 'reasoning' },
          { phase: 'answer', content: 'from list' },
        ],
        timestamp: 2,
      },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['from fragments', 'from list'],
  )
})
