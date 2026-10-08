import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHistoryMessages,
  extractChatMessages,
  tidyFragmentText,
} from '../src/browser-chats.ts'

// C3: the history-payload parsing was copy-pasted inline twice in
// fetchChatMessages; it now lives in one pure module.

test('parseHistoryMessages keeps RESPONSE for assistant and REQUEST for user', () => {
  const { list } = parseHistoryMessages([
    { role: 'USER', fragments: [{ type: 'REQUEST', content: 'hi there' }] },
    {
      role: 'ASSISTANT',
      fragments: [
        { type: 'THINK', content: 'reasoning…' },
        { type: 'RESPONSE', content: 'hello!' },
      ],
    },
  ])
  assert.deepEqual(list, [
    { role: 'user', text: 'hi there' },
    { role: 'assistant', text: 'hello!' },
  ])
})

test('parseHistoryMessages drops a turn with only THINK (no RESPONSE)', () => {
  const { list } = parseHistoryMessages([
    { role: 'ASSISTANT', fragments: [{ type: 'THINK', content: 'x' }] },
  ])
  assert.deepEqual(list, [])
})

test('parseHistoryMessages returns the LATEST accumulated_token_usage', () => {
  const { usage } = parseHistoryMessages([
    { role: 'USER', accumulated_token_usage: 100, fragments: [] },
    {
      role: 'ASSISTANT',
      accumulated_token_usage: 250,
      fragments: [{ type: 'RESPONSE', content: 'ok' }],
    },
  ])
  assert.equal(usage, 250)
})

test('parseHistoryMessages tolerates junk input', () => {
  assert.deepEqual(parseHistoryMessages(null), { list: [], usage: null })
  assert.deepEqual(parseHistoryMessages('nope'), { list: [], usage: null })
  assert.deepEqual(parseHistoryMessages([null, 1, {}]), {
    list: [],
    usage: null,
  })
})

test('tidyFragmentText collapses 3+ blank lines and trims', () => {
  const NL = String.fromCharCode(10)
  const triple = NL + NL + NL
  assert.equal(tidyFragmentText('a' + triple + 'b'), 'a' + NL + NL + 'b')
  assert.equal(tidyFragmentText('  x  '), 'x')
})

test('extractChatMessages reads the endpoint shape, null otherwise', () => {
  assert.deepEqual(
    extractChatMessages({ data: { biz_data: { chat_messages: [1, 2] } } }),
    [1, 2],
  )
  assert.equal(extractChatMessages({ data: {} }), null)
  assert.equal(extractChatMessages(null), null)
})
