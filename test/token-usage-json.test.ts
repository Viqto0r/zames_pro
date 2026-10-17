// extractTokenUsage() feeds the "ctx: N" status and /cost. It must read the
// shapes DeepSeek actually sends, not only the SSE completion stream.
//
// The net hook calls it for EVERY interesting response — including
// /api/v0/chat/history_messages, a PLAIN JSON body (not SSE) whose messages
// each carry `accumulated_token_usage`. A history-only response (a resumed
// chat, a fresh page load) therefore yielded null, and the context counter
// stayed empty until the next completion.
//
// OpenAI-compatible bodies report `usage.total_tokens`; those were ignored too.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTokenUsage } from '../src/net-capture.ts'

const NL = String.fromCharCode(10)

test('extractTokenUsage reads a plain JSON history_messages body', () => {
  const body = JSON.stringify({
    data: {
      biz_data: {
        chat_messages: [
          { role: 'USER', accumulated_token_usage: 120 },
          { role: 'ASSISTANT', accumulated_token_usage: 555 },
        ],
      },
    },
  })
  assert.equal(extractTokenUsage(body), 555)
})

test('extractTokenUsage reads an OpenAI-style usage.total_tokens', () => {
  const body = 'data: {"usage":{"total_tokens":42}}' + NL
  assert.equal(extractTokenUsage(body), 42)
})

test('extractTokenUsage still prefers the SSE counter', () => {
  const body = [
    'data: {"v":{"response":{"accumulated_token_usage":17127}}}',
    'data: {"p":"response","o":"BATCH","v":[{"p":"accumulated_token_usage","v":20000}]}',
  ].join(NL)
  assert.equal(extractTokenUsage(body), 20000)
})

test('extractTokenUsage returns null without a counter', () => {
  assert.equal(extractTokenUsage(''), null)
  assert.equal(extractTokenUsage('data: {"v":"text"}'), null)
})
