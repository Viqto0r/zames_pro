import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmChatList } from '../src/glm-chats.ts'

// parseGlmChatList's shape matrix is pinned in glm-chats.test.ts. These cases
// cover the ID/TITLE fallbacks that decide whether a row opens the right chat:
// a numeric id, a chat_id without an id, the MAP KEY as the last resort, the
// title/name precedence and nested list wrappers.

test('a numeric id is stringified', () => {
  assert.deepEqual(parseGlmChatList([{ id: 42, title: 'n' }]), [
    { id: '42', title: 'n' },
  ])
})

test('a non-finite numeric id falls back to the map key', () => {
  const out = parseGlmChatList({ k: { id: NaN, title: 't' } })
  assert.deepEqual(out, [{ id: 'k', title: 't' }])
})

test('chat_id is used when id is absent', () => {
  assert.deepEqual(parseGlmChatList([{ chat_id: 'c1', title: 't' }]), [
    { id: 'c1', title: 't' },
  ])
})

test('the map key becomes the id when the entry carries none', () => {
  assert.deepEqual(parseGlmChatList({ abc: { title: 'T' } }), [
    { id: 'abc', title: 'T' },
  ])
})

test('title wins over name, name is the fallback, both are trimmed', () => {
  assert.deepEqual(parseGlmChatList([{ id: 'a', title: '  T  ', name: 'N' }]), [
    { id: 'a', title: 'T' },
  ])
  assert.deepEqual(parseGlmChatList([{ id: 'b', name: '  N  ' }]), [
    { id: 'b', title: 'N' },
  ])
})

test('an entry without a title gets an empty one', () => {
  assert.deepEqual(parseGlmChatList([{ id: 'a' }]), [{ id: 'a', title: '' }])
})

test('a nested list wrapper is unwrapped to the real chats', () => {
  const out = parseGlmChatList({
    data: { list: { page: 1, data: [{ id: 'a', title: 'A' }] } },
  })
  assert.deepEqual(out, [{ id: 'a', title: 'A' }])
})

test('the same id twice keeps the FIRST row', () => {
  const out = parseGlmChatList([
    { id: 'a', title: 'first' },
    { id: 'a', title: 'second' },
  ])
  assert.deepEqual(out, [{ id: 'a', title: 'first' }])
})
