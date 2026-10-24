// A history payload may carry the role with surrounding whitespace (`" USER "`,
// a padded field from a serializer). The parser compared the raw value, so
// such a turn was dropped and the restored dialogue silently lost it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHistoryMessages } from '../src/browser-chats.ts'

test('a role with surrounding whitespace is still recognised', () => {
  const { list } = parseHistoryMessages([
    { role: ' USER ', fragments: [{ type: 'REQUEST', content: 'hi' }] },
    { role: 'assistant\t', fragments: [{ type: 'RESPONSE', content: 'yo' }] },
  ])
  assert.deepEqual(
    list.map((m) => m.role),
    ['user', 'assistant'],
  )
})

test('a clean role still parses (control)', () => {
  const { list } = parseHistoryMessages([
    { role: 'USER', fragments: [{ type: 'REQUEST', content: 'hi' }] },
  ])
  assert.deepEqual(
    list.map((m) => m.role),
    ['user'],
  )
})
