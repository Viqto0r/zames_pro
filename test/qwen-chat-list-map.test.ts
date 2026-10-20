// The Qwen chat list has also shipped as a MAP keyed by chat id
// (`{ data: { '<id>': { title } } }`), with the map itself under `data` (or
// under a `chats`/`list`/`items` wrapper). The map branch only looked INSIDE
// a wrapper, so the bare map shape was rejected and /chats printed "(none)"
// for a perfectly valid list — the exact regression the map support was
// added for.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenChatList } from '../src/qwen-chats.ts'

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

test('an array shape keeps working', () => {
  const out = parseQwenChatList({ data: [{ id: 'a', title: 'A' }] })
  assert.deepEqual(out, [{ id: 'a', title: 'A' }])
})
