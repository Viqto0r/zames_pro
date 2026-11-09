import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenChatList, parseQwenHistory } from '../src/qwen-chats.ts'

// test/qwen-chats.test.ts pins the MAIN shapes (data[], data.chats, the map
// history, content_list). The tolerated EDGES of the two parsers were open:
// a bare map keyed by id, the wrapper keys (`list`/`items`), a numeric field
// used as the id and a numeric chat id, the role aliases (`from`, `human`, a
// NUMERIC flag), a padded role, system/tool turns, `text` as the body, the
// fragment case and the top-level `messages` shape. Each one silently drops
// or mislabels a turn in the restored dialogue.

test('a bare map keyed by chat id is accepted, junk entries are skipped', () => {
  assert.deepEqual(
    parseQwenChatList({ data: { a: { title: ' A ' }, b: 5, c: null } }),
    [{ id: 'a', title: 'A' }],
  )
})

test('the list wrappers (chats / list / items) are unwrapped', () => {
  for (const key of ['chats', 'list', 'items']) {
    assert.deepEqual(
      parseQwenChatList({ data: { [key]: [{ id: 'x', title: 'T' }] } }),
      [{ id: 'x', title: 'T' }],
      key,
    )
  }
})

test('a numeric id is stringified and `name` is the title fallback', () => {
  assert.deepEqual(parseQwenChatList({ data: [{ id: 7, name: ' seven ' }] }), [
    { id: '7', title: 'seven' },
  ])
  assert.deepEqual(parseQwenChatList({ data: [{ chat_id: 'c1' }] }), [
    { id: 'c1', title: '' },
  ])
})

test('a duplicate id keeps the FIRST occurrence', () => {
  assert.deepEqual(
    parseQwenChatList({
      data: [
        { id: 'x', title: 'first' },
        { id: 'x', title: 'second' },
      ],
    }),
    [{ id: 'x', title: 'first' }],
  )
})

test('a top-level `messages` and a bare array are valid history shapes', () => {
  assert.deepEqual(
    parseQwenHistory({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', text: 'tx' },
      ],
    }),
    [{ role: 'user', text: 'tx' }],
  )
  assert.deepEqual(parseQwenHistory([{ role: 'assistant', content: 'a' }]), [
    { role: 'assistant', text: 'a' },
  ])
})

test('the role is read from `role`, `from` and a numeric flag, padded too', () => {
  const one = (m: Record<string, unknown>) => parseQwenHistory({ data: [m] })
  assert.deepEqual(one({ role: ' USER ', content: 'q' }), [
    { role: 'user', text: 'q' },
  ])
  assert.deepEqual(one({ from: 'human', content: 'q' }), [
    { role: 'user', text: 'q' },
  ])
  assert.deepEqual(one({ role: '1', content: 'q' }), [
    { role: 'user', text: 'q' },
  ])
  assert.deepEqual(one({ is_user: true, content: 'q' }), [
    { role: 'user', text: 'q' },
  ])
  // Anything not clearly the user is the assistant.
  assert.deepEqual(one({ role: 'something', content: 'a' }), [
    { role: 'assistant', text: 'a' },
  ])
})

test('system / tool turns are dropped in both spellings', () => {
  for (const m of [
    { role: 'system', content: 's' },
    { role: 'tool', content: 't' },
    { from: 'system', content: 's' },
  ]) {
    assert.deepEqual(parseQwenHistory({ data: [m] }), [])
  }
})

test('fragments are matched case-insensitively by the turn role', () => {
  assert.deepEqual(
    parseQwenHistory({
      data: [
        {
          role: 'assistant',
          fragments: [
            { type: 'response', content: 'an' },
            { type: 'REQUEST', content: 'nope' },
          ],
        },
      ],
    }),
    [{ role: 'assistant', text: 'an' }],
  )
})

test('a whitespace-only turn is dropped, an unknown payload is empty', () => {
  assert.deepEqual(
    parseQwenHistory({ data: [{ role: 'user', content: '   ' }] }),
    [],
  )
  assert.deepEqual(parseQwenHistory(null), [])
  assert.deepEqual(parseQwenHistory('junk'), [])
  assert.deepEqual(parseQwenChatList(null), [])
  assert.deepEqual(parseQwenChatList('junk'), [])
})
