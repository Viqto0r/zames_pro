import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenChatList } from '../src/qwen-chats.ts'
import { parseGlmChatList } from '../src/glm-chats.ts'

// parseQwenChatList read the list ONLY from `json.data`. The other provider
// parsers (GLM) accept a bare array too, and /chats hands the parsed JSON
// straight in - a bare array (the simplest shape the endpoint can return)
// made every chat disappear from the list.
test('parseQwenChatList accepts a bare array', () => {
  assert.deepEqual(parseQwenChatList([{ id: 'a', title: 'A' }]), [
    { id: 'a', title: 'A' },
  ])
})

test('the GLM parser already accepts a bare array (reference)', () => {
  assert.deepEqual(parseGlmChatList([{ id: 'a', title: 'A' }]), [
    { id: 'a', title: 'A' },
  ])
})
