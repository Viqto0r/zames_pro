// A chat list must not contain the same chat twice — the same bug the Qwen
// parser had. The GLM array form was read as-is, so a payload listing one id
// twice (a merged page) produced two identical rows in /chats.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmChatList } from '../src/glm-chats.ts'

test('a duplicated id in the GLM chat list is kept once', () => {
  const list = parseGlmChatList([
    { id: 'a', title: 'A' },
    { id: 'a', title: 'A2' },
    { id: 'b' },
  ])
  assert.deepEqual(
    list.map((c) => c.id),
    ['a', 'b'],
  )
})

test('distinct GLM chats are all kept (control)', () => {
  const list = parseGlmChatList([{ id: 'a' }, { id: 'b' }])
  assert.deepEqual(
    list.map((c) => c.id),
    ['a', 'b'],
  )
})
