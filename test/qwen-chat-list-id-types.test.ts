// The Qwen chat-list parser was hardened for the HISTORY shape (which is a
// MAP keyed by message id), but the LIST parser still required `id`/`chat_id`
// to be STRINGS and an array to iterate. Two shapes the app really ships broke
// it silently (`/chats` printed an empty list with no error):
//   * a NUMERIC id (`{id: 12345}`) was dropped as "no id";
//   * a map keyed by chat id (`data.chats = {<id>: {title}}`, the same
//     convention as the history payload) was rejected by the array guard.
// Both are cheap to tolerate and a dropped chat is unrecoverable via /chats.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenChatList } from '../src/qwen-chats.ts'

test('a numeric chat id is read as a string id', () => {
  assert.deepEqual(parseQwenChatList({ data: [{ id: 12345, title: 'T' }] }), [
    { id: '12345', title: 'T' },
  ])
  assert.deepEqual(
    parseQwenChatList({ data: [{ chat_id: 999, title: 'T' }] }),
    [{ id: '999', title: 'T' }],
  )
})

test('a chat list given as a map keyed by id is read', () => {
  assert.deepEqual(
    parseQwenChatList({
      data: {
        chats: {
          '9f3c-1': { title: 'First' },
          '9f3c-2': { title: 'Second' },
        },
      },
    }),
    [
      { id: '9f3c-1', title: 'First' },
      { id: '9f3c-2', title: 'Second' },
    ],
  )
})

test('an array shape keeps working', () => {
  assert.deepEqual(parseQwenChatList({ data: [{ id: 'a', title: 'b' }] }), [
    { id: 'a', title: 'b' },
  ])
  assert.deepEqual(parseQwenChatList(null), [])
})
