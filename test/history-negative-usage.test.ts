import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHistoryMessages } from '../src/browser-chats.ts'

// Every history message carries the running `accumulated_token_usage`, and the
// LATEST value becomes the restored context size (browser._lastTokenUsage ->
// the status badge, /cost, /status and the auto-compact percentage). A
// NEGATIVE value is a nonsense payload, yet it was accepted as-is: the badge
// then vanished (tokenStatusLevel rejects a negative count) and the
// auto-compact percentage went negative so it never fired. Only a finite
// NON-NEGATIVE counter is a usage; 0 stays valid.
test('a negative accumulated_token_usage is not a usage', () => {
  const res = parseHistoryMessages([
    {
      role: 'USER',
      accumulated_token_usage: -5,
      fragments: [{ type: 'REQUEST', content: 'u' }],
    },
  ])
  assert.equal(res.usage, null)
  assert.equal(res.list.length, 1)
})

test('a real accumulated_token_usage is still returned', () => {
  const res = parseHistoryMessages([
    {
      role: 'USER',
      accumulated_token_usage: 1234,
      fragments: [{ type: 'REQUEST', content: 'u' }],
    },
  ])
  assert.equal(res.usage, 1234)
  // Zero is a legitimate value.
  const zero = parseHistoryMessages([
    {
      role: 'USER',
      accumulated_token_usage: 0,
      fragments: [{ type: 'REQUEST', content: 'u' }],
    },
  ])
  assert.equal(zero.usage, 0)
})
