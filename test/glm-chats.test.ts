import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGlmChatList, parseGlmHistory } from '../src/glm-chats.ts'
import { extractChatId } from '../src/glm-net-capture.ts'

// One file for the whole GLM chat/history/chat-id matrix: the live fixture
// shapes plus every wrapper variant that once broke /chats or the saved
// session id. The tests stay together because they all exercise the same
// three parsers over the same payload family.

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'glm',
)
const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'))

// --- parseGlmChatList: the live fixture --------------------------------------
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

// --- parseGlmChatList: duplicates -------------------------------------------
// The same bug the Qwen parser had: the array form was read as-is, so a
// payload listing one id twice (a merged page) produced two identical rows.
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

// --- parseGlmChatList: wrappers ---------------------------------------------
// ONE level (`data`) was unwrapped and whatever was found was treated as a
// chat MAP: `{data:{chats:[…]}}` produced a single bogus chat whose id is the
// wrapper KEY and whose title is empty.
test('parseGlmChatList: an inner chats/list/items wrapper is unwrapped', () => {
  assert.deepEqual(
    parseGlmChatList({ data: { chats: [{ id: 'a', title: 'A' }] } }),
    [{ id: 'a', title: 'A' }],
  )
  assert.deepEqual(
    parseGlmChatList({ data: { list: [{ id: 'b', title: 'B' }] } }),
    [{ id: 'b', title: 'B' }],
  )
  assert.deepEqual(
    parseGlmChatList({ data: { items: [{ id: 'c', title: 'C' }] } }),
    [{ id: 'c', title: 'C' }],
  )
})

test('parseGlmChatList: an id-keyed map is still read as chats', () => {
  // A map is a LEGITIMATE shape (the history endpoint uses one); it must not be
  // mistaken for a wrapper key.
  assert.deepEqual(parseGlmChatList({ data: { id1: { title: 'T1' } } }), [
    { id: 'id1', title: 'T1' },
  ])
})

test('parseGlmChatList: a wrapper key never becomes a chat id', () => {
  const list = parseGlmChatList({ data: { chats: [{ id: 'a', title: 'A' }] } })
  assert.equal(
    list.some((c) => c.id === 'chats'),
    false,
    'the wrapper key leaked into the list as an id',
  )
})

// A paginated reply `{chats:{page,data:[…]}}` was unwrapped one level and the
// inner object was then read as an id-keyed MAP, so the wrapper key (`'data'`)
// became a chat id with an empty title.
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

test('parseGlmChatList: a paginated wrapper key never becomes a chat id', () => {
  const list = parseGlmChatList({
    chats: { page: 1, data: [{ id: 'd', title: 'D' }] },
  })
  assert.equal(
    list.some((c) => c.id === 'data'),
    false,
  )
})

// --- parseGlmHistory ---------------------------------------------------------
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

// --- extractChatId -----------------------------------------------------------
// The chat id is read from the API body so a FRESH chat's session is saved
// before the URL catches up. A wrapper object can carry its OWN `id` BEFORE the
// chat's, so `chat_id` must win and a message id must never become the session
// id (it can never be opened again).
const UUID = '6f1c2a3e-1b2c-4d5e-8f90-123456789abc'
const OTHER = '11111111-2222-4333-8444-555555555555'

test('chat_id wins over a bare id in the same body', () => {
  const body = JSON.stringify({ id: OTHER, chat_id: UUID })
  assert.equal(extractChatId(body), UUID)
})

test('a bare id is still accepted when no chat_id is present', () => {
  assert.equal(extractChatId(JSON.stringify({ id: UUID })), UUID)
})

test('an id nested under a key that is not the chat is not used', () => {
  // A completion envelope: the assistant MESSAGE id sits next to the chat id.
  const body = JSON.stringify({
    message: { id: OTHER },
    chat: { id: UUID },
  })
  assert.notEqual(extractChatId(body), OTHER)
})

test('a non-uuid string never becomes a chat id', () => {
  assert.equal(extractChatId(JSON.stringify({ id: 'not-a-uuid' })), null)
})
