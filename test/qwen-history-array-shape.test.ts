import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

// The history endpoint has shipped more than one shape. The parser accepts
// `data.messages`, `data.chat.messages` and `data.chat.history.messages`, but
// when `history` is a BARE ARRAY (`{chat:{history:[…]}}` — a plausible
// paginated variant) the code did `hist.messages` on an array, got undefined,
// and returned NOTHING: `/resume` printed an empty dialogue even though the
// payload carried it. The array form must be accepted like everywhere else in
// this parser.
test('a bare array under chat.history is accepted', () => {
  const json = {
    data: {
      chat: {
        history: [
          { role: 'user', content: 'first', timestamp: 1 },
          { role: 'assistant', content: 'second', timestamp: 2 },
        ],
      },
    },
  }
  assert.deepEqual(
    parseQwenHistory(json).map((m) => m.text),
    ['first', 'second'],
  )
})

test('a bare array under chat.messages is accepted', () => {
  const json = {
    data: { chat: { messages: [{ role: 'assistant', content: 'hi' }] } },
  }
  assert.deepEqual(
    parseQwenHistory(json).map((m) => m.text),
    ['hi'],
  )
})
