import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

// The 15s inter-send throttle only knew about OUR sends. If the operator
// sent a message into the agent's chat by hand (or resumed the chat in the web
// UI), the agent's next send could fire too soon after it and hit the rate
// limit. A completion/continue body that arrives while WE have no ask in
// flight is the operator's own turn; _onResponse records that moment in
// _lastSentAt so the next agent send waits out the interval.

function fakeResponse(url: string, body: string): unknown {
  return {
    url: () => url,
    headers: () => ({ 'content-type': 'text/event-stream' }),
    text: async () => body,
  }
}

const OK_BODY =
  'data: ' +
  JSON.stringify({ choices: [{ delta: { content: '{"tool": "respond"}' } }] }) +
  '\n'

test('a manual turn (no ask in flight) bumps _lastSentAt', async () => {
  const b = new DeepSeekBrowser()
  const before = (b as unknown as { _lastSentAt: number })._lastSentAt
  assert.equal(before, 0)
  await b._onResponse(
    fakeResponse(
      'https://chat.deepseek.com/api/v0/chat/completion',
      OK_BODY,
    ) as never,
  )
  const after = (b as unknown as { _lastSentAt: number })._lastSentAt
  assert.ok(after > 0, 'operator turn should set _lastSentAt')
})

test('a body during OUR own ask does NOT re-bump _lastSentAt', async () => {
  const b = new DeepSeekBrowser()
  const any = b as unknown as { _askInFlight: number; _lastSentAt: number }
  any._askInFlight = 1
  any._lastSentAt = 111
  await b._onResponse(
    fakeResponse(
      'https://chat.deepseek.com/api/v0/chat/completion',
      OK_BODY,
    ) as never,
  )
  assert.equal(any._lastSentAt, 111, 'our own send must not be re-timestamped')
})

test('ask() tracks the in-flight counter (finally decrements)', async () => {
  // A minimal sanity check: the counter starts at 0 and a failing ask leaves
  // it at 0 (the try/finally decrements it).
  const b = new DeepSeekBrowser({ askRetries: 1 })
  const any = b as unknown as { _askInFlight: number }
  assert.equal(any._askInFlight, 0)
  // No page/input -> _askOnce throws quickly, ask() must clean up the counter.
  await b.ask('x', { agent: false }).catch(() => {})
  assert.equal(any._askInFlight, 0)
})
