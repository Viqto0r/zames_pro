import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DeepSeekBrowser,
  ContextLimitError,
  isContextLimitText,
  isRateLimitText,
  isServerBusyText,
} from '../src/browser.ts'

// "Length limit reached. Please start a new chat." is the chat's CONTEXT
// WINDOW being exhausted, not a rate limit and not a server hiccup. Before
// this, the notice fell into the generic ask() retry, so the agent resent the
// message into a chat that can never accept it again, burned askRetries and
// stopped with a bare error — the operator had to notice the notice by hand.
// The recovery is compaction into a fresh chat, so the detector has its own
// class and its own ask() branch.

const LIMIT_TOAST = 'Length limit reached. Please start a new chat.'

test('the context-limit notice is recognized and kept apart', () => {
  assert.equal(isContextLimitText(LIMIT_TOAST), true)
  assert.equal(
    isContextLimitText('Достигнут лимит длины. Начните новый чат.'),
    true,
  )
  // It must not be mistaken for the two conditions that DO retry in place:
  // a rate limit waits minutes, a server hiccup retries in seconds, while this
  // can never succeed in the same chat.
  assert.equal(isRateLimitText(LIMIT_TOAST), false)
  assert.equal(isServerBusyText(LIMIT_TOAST), false)
  assert.equal(isContextLimitText('Here is the file you asked for.'), false)
})

test('ContextLimitError is its own error class', () => {
  const e = new ContextLimitError('Length limit reached.')
  assert.equal(e.name, 'ContextLimitError')
  assert.ok(e instanceof Error)
})

test('an exhausted chat triggers the compaction callback and the resend', async () => {
  const b = new DeepSeekBrowser({ maxContextLimitRetries: 1 })
  const notices: string[] = []
  ;(b as unknown as { _notice: (s: string) => void })._notice = (s: string) => {
    notices.push(s)
  }
  let asks = 0
  let compactions = 0
  b.onContextLimit = async () => {
    compactions++
    return true
  }
  // First send: the chat refuses it. Second send (after the compaction): a
  // normal answer, so ask() must return it instead of giving up.
  ;(b as unknown as { _askOnce: unknown })._askOnce = async () => {
    asks++
    if (asks === 1) throw new ContextLimitError(LIMIT_TOAST)
    return '{"tool": "respond", "args": {"message": "ok"}}'
  }
  const answer = await b.ask('hello', { agent: true })
  assert.equal(asks, 2, 'the message must be resent after the compaction')
  assert.equal(compactions, 1)
  assert.match(answer, /respond/)
  assert.ok(
    notices.some((n) => /limit|лимит/i.test(n)),
    'the operator must see what happened: ' + JSON.stringify(notices),
  )
})

test('without a compaction callback the failure is explained, not retried', async () => {
  const b = new DeepSeekBrowser()
  const notices: string[] = []
  ;(b as unknown as { _notice: (s: string) => void })._notice = (s: string) => {
    notices.push(s)
  }
  let asks = 0
  ;(b as unknown as { _askOnce: unknown })._askOnce = async () => {
    asks++
    throw new ContextLimitError(LIMIT_TOAST)
  }
  await assert.rejects(() => b.ask('hello', { agent: true }), /context limit/i)
  assert.equal(asks, 1, 'a refused chat must not be hammered with retries')
  assert.ok(notices.some((n) => /new chat|новый чат/i.test(n)))
})

test('a failed compaction gives up instead of looping', async () => {
  const b = new DeepSeekBrowser({ maxContextLimitRetries: 3 })
  ;(b as unknown as { _notice: (s: string) => void })._notice = () => {}
  let asks = 0
  let compactions = 0
  b.onContextLimit = async () => {
    compactions++
    return false
  }
  ;(b as unknown as { _askOnce: unknown })._askOnce = async () => {
    asks++
    throw new ContextLimitError(LIMIT_TOAST)
  }
  await assert.rejects(() => b.ask('hello', { agent: true }))
  assert.equal(compactions, 1, 'one attempt, then give up')
  assert.equal(asks, 1)
})
