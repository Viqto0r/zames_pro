import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser, isRateLimitText } from '../src/browser.ts'

// The rate limit can arrive ONLY in the SSE body of chat/completion. The
// DOM toast is short-lived and easy to miss, so the old code waited out the
// whole deadline and threw ds.send_no_new_answer while the chat plainly
// showed "Messages too frequent". _onResponse now records the body flag, and
// the ask() loops throw RateLimitError from it.

const RATE_BODY = [
  'event: ready',
  'data: {"request_message_id":567,"response_message_id":568}',
  'event: hint',
  'data: {"type":"error","content":"Messages too frequent. Try again later.","clear_response":true,"finish_reason":"rate_limit_reached"}',
  'event: close',
  'data: {"click_behavior":"retry","auto_resume":false}',
].join('\n')

function fakeResponse(url: string, body: string): unknown {
  return {
    url: () => url,
    headers: () => ({ 'content-type': 'text/event-stream' }),
    text: async () => body,
  }
}

test('a rate-limit SSE body is recognized', () => {
  assert.equal(isRateLimitText(RATE_BODY), true)
})

test('_onResponse records the rate limit from the SSE body', async () => {
  const b = new DeepSeekBrowser()
  await b._onResponse(
    fakeResponse(
      'https://chat.deepseek.com/api/v0/chat/completion',
      RATE_BODY,
    ) as never,
  )
  assert.equal(
    (b as unknown as { _netRateLimited: boolean })._netRateLimited,
    true,
  )
})

test('a normal answer does NOT set the rate-limit flag', async () => {
  const b = new DeepSeekBrowser()
  const ok =
    'data: ' +
    JSON.stringify({
      choices: [{ delta: { content: '{"tool": "respond"}' } }],
    }) +
    '\n'
  await b._onResponse(
    fakeResponse(
      'https://chat.deepseek.com/api/v0/chat/completion',
      ok,
    ) as never,
  )
  assert.equal(
    (b as unknown as { _netRateLimited: boolean })._netRateLimited,
    false,
  )
})
