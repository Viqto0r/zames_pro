import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGlmChatList, parseGlmHistory } from '../src/glm-chats.ts'

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'glm',
)
const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'))

test('parseGlmChatList reads the live BARE ARRAY shape', () => {
  const list = parseGlmChatList(fixture('chat-list.json'))
  assert.equal(list.length, 2)
  assert.equal(list[0].id, '0e651f21-d9a3-4120-b700-98f423da8af7')
  assert.equal(list[0].title, 'Exact Reply: PONG')
})

test('parseGlmChatList accepts a {data:[...]} wrapper and an id-keyed map', () => {
  const wrapped = parseGlmChatList({ data: [{ id: 'a', title: 'A' }] })
  assert.deepEqual(wrapped, [{ id: 'a', title: 'A' }])
  const keyed = parseGlmChatList({ x: { title: 'X' }, y: { id: 'y' } })
  assert.equal(keyed.length, 2)
  assert.ok(keyed.some((c) => c.id === 'y'))
})

test('parseGlmChatList never throws on garbage', () => {
  assert.deepEqual(parseGlmChatList(null), [])
  assert.deepEqual(parseGlmChatList('nope'), [])
  assert.deepEqual(parseGlmChatList(42), [])
})

test('parseGlmHistory walks chat.history.messages and keeps the user turn', () => {
  const msgs = parseGlmHistory(fixture('chat-history.json'))
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].role, 'user')
  assert.equal(msgs[0].text, 'Reply with exactly: PONG')
})

test('parseGlmHistory skips a content-less assistant node', () => {
  // The live response carries NO content for the assistant node, so nothing
  // is invented for it (the DOM is the fallback for that turn).
  const msgs = parseGlmHistory(fixture('chat-history.json'))
  assert.ok(!msgs.some((m) => m.role === 'assistant'))
})

test('parseGlmHistory sorts by timestamp and accepts an array', () => {
  const msgs = parseGlmHistory({
    messages: [
      { id: '2', role: 'assistant', content: 'two', timestamp: 20 },
      { id: '1', role: 'user', content: 'one', timestamp: 10 },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['one', 'two'],
  )
})
