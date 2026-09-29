import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

// A4: `_onResponse` used to call extractAnswer() on EVERY deepseek
// json/event-stream response and set `_netCapture` whenever the result was
// non-empty. Only the SSE completion shape carries real answers today, but any
// future endpoint returning an object with a content/text/response string
// would clobber the answer and look fresh (it could be returned as the final
// answer). The capture is now gated to chat/completion and chat/continue URLs.

function fakeResponse(url: string, body: string): unknown {
  return {
    url: () => url,
    headers: () => ({ 'content-type': 'application/json' }),
    text: async () => body,
  }
}

test('a non-completion body with a content field does not set _netCapture', async () => {
  const b = new DeepSeekBrowser()
  const resp = fakeResponse(
    'https://chat.deepseek.com/api/v0/chat/some_other_endpoint',
    JSON.stringify({ content: 'NOT AN ANSWER' }),
  )
  await b._onResponse(resp as never)
  assert.equal((b as unknown as { _netCapture: string })._netCapture, '')
})

test('a completion body with a content field sets _netCapture', async () => {
  const b = new DeepSeekBrowser()
  const sse =
    'data: ' + JSON.stringify({ choices: [{ delta: { content: 'REAL' } }] }) + '\n'
  const resp = fakeResponse(
    'https://chat.deepseek.com/api/v0/chat/completion',
    sse,
  )
  await b._onResponse(resp as never)
  assert.equal((b as unknown as { _netCapture: string })._netCapture, 'REAL')
})
