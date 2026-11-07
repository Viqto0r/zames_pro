import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmHistory, parseGlmChatList } from '../src/glm-chats.ts'

// parseGlmHistory restores a chat from the history payload. Its TEXT-SOURCE
// chain (content -> text -> fragments -> content_list) and the reasoning-phase
// filter are not covered by the role/order files, and getting one wrong either
// loses an answer or restores the THINK phase as the model's reply.

test('content wins over text when both are present', () => {
  const msgs = parseGlmHistory({
    messages: [{ role: 'user', content: 'from content', text: 'from text' }],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['from content'],
  )
})

test('content WINS over text even when it is empty', () => {
  // The chain is if/else-if: a PRESENT `content` key is taken as the source,
  // so an empty content does NOT fall through to `text` (the turn is dropped).
  // Pinned as the current contract; a payload that means the answer to live in
  // `text` must omit `content` entirely.
  const msgs = parseGlmHistory({
    messages: [{ role: 'user', content: '', text: 'fallback' }],
  })
  assert.deepEqual(msgs, [])
  const omitted = parseGlmHistory({
    messages: [{ role: 'user', text: 'fallback' }],
  })
  assert.deepEqual(
    omitted.map((m) => m.text),
    ['fallback'],
  )
})

test('fragments: REQUEST is the user turn, RESPONSE the answer', () => {
  const msgs = parseGlmHistory({
    messages: [
      {
        role: 'user',
        fragments: [{ type: 'REQUEST', content: 'question' }],
      },
      {
        role: 'assistant',
        fragments: [{ type: 'RESPONSE', content: 'answer' }],
      },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => [m.role, m.text]),
    [
      ['user', 'question'],
      ['assistant', 'answer'],
    ],
  )
})

test('fragment types are matched case-insensitively', () => {
  const msgs = parseGlmHistory({
    messages: [
      { role: 'user', fragments: [{ type: 'request', content: 'q' }] },
      { role: 'assistant', fragments: [{ type: 'response', content: 'a' }] },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['q', 'a'],
  )
})

test('a fragment of the WRONG kind contributes nothing', () => {
  const msgs = parseGlmHistory({
    messages: [
      { role: 'assistant', fragments: [{ type: 'REQUEST', content: 'leak' }] },
    ],
  })
  assert.deepEqual(msgs, [])
})

test('content_list is used when content is empty and skips reasoning', () => {
  const msgs = parseGlmHistory({
    messages: [
      {
        role: 'assistant',
        content: '',
        content_list: [
          { phase: 'thinking', content: 'secret reasoning' },
          { phase: 'answer', content: 'the answer' },
        ],
      },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['the answer'],
  )
})

test('a turn whose text is only whitespace is dropped', () => {
  assert.deepEqual(
    parseGlmHistory({ messages: [{ role: 'user', content: '   ' }] }),
    [],
  )
})

test('a duplicated chat id is kept once, first one wins', () => {
  const chats = parseGlmChatList([
    { id: 'a', title: 'first' },
    { id: 'a', title: 'second' },
    { id: 'b', title: 'third' },
  ])
  assert.deepEqual(chats, [
    { id: 'a', title: 'first' },
    { id: 'b', title: 'third' },
  ])
})

test('a chat entry that is not an object is skipped', () => {
  const chats = parseGlmChatList([null, 'x', 42, { id: 'ok', title: 't' }])
  assert.deepEqual(chats, [{ id: 'ok', title: 't' }])
})

test('a non-finite numeric id is not a chat id', () => {
  assert.deepEqual(parseGlmChatList([{ id: Number.NaN, title: 'x' }]), [])
})
