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

test('parseGlmHistory: system and tool turns are dropped from BOTH fields', () => {
  // The live response carries `role` only; the parser must not invent a
  // role from an unobserved field. A turn whose ROLE is unknown stays the
  // assistant's (the safe default), while system/tool never appear.
  const msgs = parseGlmHistory({
    messages: [
      { role: 'SYSTEM', content: 'sys', timestamp: 1 },
      { role: 'tool', content: 'out', timestamp: 2 },
      { role: 'user', content: 'q', timestamp: 3 },
      { role: 'assistant', content: 'a', timestamp: 4 },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.role),
    ['user', 'assistant'],
  )
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
