// A chat list must not contain the same chat twice: /chats (and /sessions)
// would show it twice, and resuming "the second one" opens the same chat. The
// array form was read as-is, so a payload carrying a duplicate id (a merged
// page, an optimistic entry) produced a duplicate row.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenChatList } from '../src/qwen-chats.ts'

test('a duplicated id in the chat list is kept once', () => {
  const list = parseQwenChatList({
    data: [{ id: 'a', title: 'A' }, { id: 'a', title: 'A2' }, { id: 'b' }],
  })
  assert.deepEqual(
    list.map((c) => c.id),
    ['a', 'b'],
  )
})

test('distinct chats are all kept (control)', () => {
  const list = parseQwenChatList({ data: [{ id: 'a' }, { id: 'b' }] })
  assert.deepEqual(
    list.map((c) => c.id),
    ['a', 'b'],
  )
})
