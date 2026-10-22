import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmChatList } from '../src/glm-chats.ts'

// `parseGlmChatList` unwrapped ONE level (`data`) and then treated whatever it
// found as a chat MAP. A reply wrapped TWICE — `{data:{chats:[…]}}`, the
// natural shape of a paginated endpoint — produced a single bogus chat whose
// id is the wrapper KEY (`'chats'`) and whose title is empty. /chats then
// listed a fake chat, and the real list was unreachable.
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
