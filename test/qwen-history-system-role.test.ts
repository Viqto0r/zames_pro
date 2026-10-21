import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

// The restored dialogue shows the operator's turns and the model's answers.
// A SYSTEM turn is neither: on Qwen the system prompt is stored in the history
// map as its own message, and the parser maps everything that is not 'user' to
// ASSISTANT - so the long system prompt was printed as a model ANSWER in
// /resume (and its size could push the real turns past the 20-message window).
// DeepSeek's parser already drops SYSTEM/TOOL turns.
test('parseQwenHistory drops a SYSTEM turn', () => {
  const msgs = parseQwenHistory({
    data: [
      { role: 'user', content: 'hi' },
      { role: 'system', content: 'You are a coding agent...' },
      { role: 'assistant', content: 'hello' },
    ],
  })
  assert.deepEqual(msgs, [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'hello' },
  ])
})

test('parseQwenHistory still keeps a role-less turn as the assistant', () => {
  const msgs = parseQwenHistory({ data: [{ content: 'answer' }] })
  assert.deepEqual(msgs, [{ role: 'assistant', text: 'answer' }])
})
