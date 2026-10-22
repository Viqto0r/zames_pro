import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmChatList } from '../src/glm-chats.ts'

// The same double-wrapper trap the Qwen list had: a paginated reply
// `{chats:{page,data:[…]}}` was unwrapped one level and the inner object was
// then read as an id-keyed MAP, so the wrapper key (`'data'`) became a chat id
// with an empty title.
test('parseGlmChatList: a paginated inner wrapper is unwrapped', () => {
  assert.deepEqual(
    parseGlmChatList({ chats: { page: 1, data: [{ id: 'd', title: 'D' }] } }),
    [{ id: 'd', title: 'D' }],
  )
  assert.deepEqual(
    parseGlmChatList({ data: { list: { data: [{ id: 'e' }] } } }),
    [{ id: 'e', title: '' }],
  )
})

test('parseGlmChatList: a wrapper key never becomes a chat id', () => {
  const list = parseGlmChatList({
    chats: { page: 1, data: [{ id: 'd', title: 'D' }] },
  })
  assert.equal(
    list.some((c) => c.id === 'data'),
    false,
  )
})
