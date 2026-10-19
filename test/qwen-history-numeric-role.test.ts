import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

// The role of a Qwen history message has been seen as `role` (string,
// case-insensitive), a NUMERIC flag, or `is_user`. The parser only accepted
// the STRING '0' as "user": a numeric `role: 1` (the natural encoding where
// 1 = user, 2 = assistant) fell through to the assistant branch, so a restored
// dialogue showed EVERY message as the assistant — the operator's own prompts
// were attributed to the model.

function msg(role: unknown): Array<{ role: string }> {
  return parseQwenHistory({
    data: { messages: { a: { role, content: 'x', timestamp: 1 } } },
  })
}

test('a numeric user role (1) is read as the user', () => {
  assert.equal(msg(1)[0]?.role, 'user')
})

test('a numeric assistant role (2) is read as the assistant', () => {
  assert.equal(msg(2)[0]?.role, 'assistant')
})

test('the string forms still work', () => {
  assert.equal(msg('user')[0]?.role, 'user')
  assert.equal(msg('assistant')[0]?.role, 'assistant')
  assert.equal(msg('0')[0]?.role, 'user')
})

test('is_user boolean still works', () => {
  const r = parseQwenHistory({
    data: { messages: { a: { is_user: true, content: 'q', timestamp: 1 } } },
  })
  assert.equal(r[0]?.role, 'user')
})
