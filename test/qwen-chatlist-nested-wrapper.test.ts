import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenChatList } from '../src/qwen-chats.ts'

// A paginated list is often wrapped TWICE: `{data:{chats:{page,data:[…]}}}`.
// `parseQwenChatList` unwrapped one level and then treated the inner object as
// an id-keyed MAP, so the wrapper's own key became a chat id (`'data'` /
// `'list'`) with an empty title — /chats showed one fake chat and hid the real
// ones.
test('parseQwenChatList: a paginated inner wrapper is unwrapped', () => {
  assert.deepEqual(
    parseQwenChatList({ data: { chats: { page: 1, data: [{ id: 'd' }] } } }),
    [{ id: 'd', title: '' }],
  )
  assert.deepEqual(
    parseQwenChatList({ data: { chats: { list: [{ id: 'e' }] } } }),
    [{ id: 'e', title: '' }],
  )
})

test('parseQwenChatList: a wrapper key never becomes a chat id', () => {
  const list = parseQwenChatList({
    data: { chats: { page: 1, data: [{ id: 'd' }] } },
  })
  assert.equal(
    list.some((c) => c.id === 'data' || c.id === 'list'),
    false,
  )
})

test('parseQwenChatList: an id-keyed map is still read as chats', () => {
  assert.deepEqual(parseQwenChatList({ data: { c1: { title: 'T1' } } }), [
    { id: 'c1', title: 'T1' },
  ])
})
