// The chat-list parser accepts a BARE array as a valid shape, but the history
// parser only looked INSIDE `root.data` — so a bare array reply (an older
// build, or the same simple shape the list endpoint uses) yielded an empty
// restored dialogue: `/resume` showed nothing even though the payload had the
// whole conversation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

test('parseQwenHistory: a bare array of messages is parsed', () => {
  const msgs = parseQwenHistory([
    { role: 'user', content: 'question', timestamp: 1 },
    { role: 'assistant', content: 'answer', timestamp: 2 },
  ])
  assert.deepEqual(msgs, [
    { role: 'user', text: 'question' },
    { role: 'assistant', text: 'answer' },
  ])
})

test('parseQwenHistory: top-level `messages` without a data wrapper', () => {
  const msgs = parseQwenHistory({
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.deepEqual(msgs, [{ role: 'user', text: 'hi' }])
})

test('parseQwenHistory: the nested data.chat.history shape still works', () => {
  const msgs = parseQwenHistory({
    data: {
      chat: {
        history: {
          messages: { a: { role: 'user', content: 'q', timestamp: 1 } },
        },
      },
    },
  })
  assert.deepEqual(msgs, [{ role: 'user', text: 'q' }])
})
