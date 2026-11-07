import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmHistory, parseGlmChatList } from '../src/glm-chats.ts'

// parseGlmHistory restores a resumed z.ai dialogue. A misread ROLE prints the
// operator's own question as the model's answer, and a misread ORDER turns the
// dialogue inside out, so both are pinned here (the live-fixture shapes have
// their own file).

test('a padded or mixed-case role is still read as the user turn', () => {
  const msgs = parseGlmHistory({
    messages: [
      { role: ' USER ', content: 'hi' },
      { role: 'Human', content: 'me again' },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => [m.role, m.text]),
    [
      ['user', 'hi'],
      ['user', 'me again'],
    ],
  )
})

test('an unknown role defaults to the assistant turn', () => {
  const msgs = parseGlmHistory({
    messages: [{ role: 'model', content: 'answer' }],
  })
  assert.equal(msgs[0].role, 'assistant')
})

test('system and tool turns are dropped entirely', () => {
  const msgs = parseGlmHistory({
    messages: [
      { role: 'system', content: 'you are helpful' },
      { role: 'tool', content: 'sandbox output' },
      { role: 'user', content: 'real question' },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['real question'],
  )
})

test('text is read from content, then text', () => {
  const msgs = parseGlmHistory({
    messages: [
      { role: 'user', content: 'from content' },
      { role: 'user', text: 'from text' },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['from content', 'from text'],
  )
})

test('a HALF-stamped payload keeps the insertion order, not the dated-first order', () => {
  // The second turn has no timestamp: pushing every undated turn first made
  // the dialogue come back as "the model answered before it was asked".
  const msgs = parseGlmHistory({
    messages: [
      { role: 'user', content: 'first', timestamp: 10 },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third', timestamp: 30 },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['first', 'second', 'third'],
  )
})

test('an ISO timestamp orders the turns like a numeric one', () => {
  const msgs = parseGlmHistory({
    messages: [
      {
        role: 'assistant',
        content: 'later',
        timestamp: '2026-10-23T10:05:00Z',
      },
      { role: 'user', content: 'earlier', timestamp: '2026-10-23T10:00:00Z' },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['earlier', 'later'],
  )
})

test('an id-keyed message map is read like an array', () => {
  const msgs = parseGlmHistory({
    messages: {
      a: { role: 'user', content: 'one', timestamp: 1 },
      b: { role: 'assistant', content: 'two', timestamp: 2 },
    },
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['one', 'two'],
  )
})

test('a numeric chat id becomes a string, never the map key', () => {
  const chats = parseGlmChatList([{ id: 123, title: ' t ' }])
  assert.deepEqual(chats, [{ id: '123', title: 't' }])
})

test('a chat without an id falls back to its MAP key', () => {
  const chats = parseGlmChatList({ 'key-1': { title: 'named' } })
  assert.deepEqual(chats, [{ id: 'key-1', title: 'named' }])
})

test('a nameless chat keeps an empty title', () => {
  const chats = parseGlmChatList([{ id: 'x' }])
  assert.deepEqual(chats, [{ id: 'x', title: '' }])
})
