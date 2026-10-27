import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenChatList } from '../src/qwen-chats.ts'
import { parseGlmChatList } from '../src/glm-chats.ts'

// parseQwenChatList has been hardened against every shape the endpoint has
// actually shipped. Each `describe` is a case that once broke `/chats`
// silently (an empty list, a fake entry or a duplicate row), so the tests are
// kept together here: one file, one parser, the whole shape matrix.

// --- bare array -------------------------------------------------------------
// The parser read the list ONLY from `json.data`. The other providers (GLM)
// accept a bare array too, and /chats hands the parsed JSON straight in - a
// bare array (the simplest shape the endpoint can return) made every chat
// disappear from the list.
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

// --- duplicate ids ----------------------------------------------------------
// /chats (and /sessions) would show the same chat twice, and resuming "the
// second one" opens the same chat. The array form was read as-is, so a payload
// carrying a duplicate id (a merged page, an optimistic entry) produced a
// duplicate row.
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

// --- id types and the map shape --------------------------------------------
// The parser was hardened for the HISTORY shape (a MAP keyed by message id),
// but the LIST parser still required `id`/`chat_id` to be STRINGS and an array
// to iterate. Two shapes the app really ships broke it silently:
//   * a NUMERIC id (`{id: 12345}`) was dropped as "no id";
//   * a map keyed by chat id (`data.chats = {<id>: {title}}`) was rejected by
//     the array guard.
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

// --- bare id-keyed map ------------------------------------------------------
// The map has also shipped directly under `data` (or under a
// `chats`/`list`/`items` wrapper). The map branch only looked INSIDE a wrapper,
// so the bare map shape was rejected and /chats printed "(none)".
test('a bare id-keyed map under data is parsed', () => {
  const out = parseQwenChatList({
    data: { c1: { title: 'One' }, c2: { title: 'Two' } },
  })
  assert.deepEqual(out, [
    { id: 'c1', title: 'One' },
    { id: 'c2', title: 'Two' },
  ])
})

test('a map keyed by id inside chats is still parsed', () => {
  const out = parseQwenChatList({
    data: { chats: { c1: { title: 'One' } } },
  })
  assert.deepEqual(out, [{ id: 'c1', title: 'One' }])
})

// --- paginated inner wrapper ------------------------------------------------
// A paginated list is often wrapped TWICE: `{data:{chats:{page,data:[…]}}}`.
// The parser unwrapped one level and then treated the inner object as an
// id-keyed MAP, so the wrapper's own key became a chat id (`'data'` / `'list'`)
// with an empty title — /chats showed one fake chat and hid the real ones.
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
