import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

// The role field is defensive, but `from` was NOT: only the exact lowercase
// 'user' counted, so a turn sent as `from: 'USER'` (or `from: 'human'`, which
// Qwen has also shipped) was restored as the ASSISTANT's answer — the
// operator's question appeared as the model's reply in /resume.
function role(m: Record<string, unknown>): string | undefined {
  return parseQwenHistory({
    data: { messages: { a: { content: 'x', timestamp: 1, ...m } } },
  })[0]?.role
}

test('parseQwenHistory reads an uppercase `from: USER` as the user', () => {
  assert.equal(role({ from: 'USER' }), 'user')
})

test('parseQwenHistory reads `from: human` as the user', () => {
  assert.equal(role({ from: 'human' }), 'user')
})

test('parseQwenHistory still reads `from: assistant` as the assistant', () => {
  assert.equal(role({ from: 'assistant' }), 'assistant')
})
