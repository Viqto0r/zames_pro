// The Qwen token counter comes straight from the server's `usage` object.
// DeepSeek and GLM already REJECT a negative count (a wrapped int in a proxy
// build, a nonsense payload) and return null, so the context badge keeps the
// last good value. Qwen accepted `input_tokens: -5` as-is: `_lastTokenUsage`
// became negative, the context badge vanished (tokenStatusLevel rejects a
// negative count) and the auto-compact percentage went negative and never
// fired — the same bug already fixed in the other two providers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTokenUsage } from '../src/qwen-net-capture.ts'

const NL = String.fromCharCode(10)

test('a negative input_tokens is not a context size', () => {
  const body = 'data: ' + JSON.stringify({ usage: { input_tokens: -5 } })
  assert.equal(extractTokenUsage(body), null)
})

test('a negative total_tokens fallback is not a context size', () => {
  const body = 'data: ' + JSON.stringify({ usage: { total_tokens: -9 } }) + NL
  assert.equal(extractTokenUsage(body), null)
})

test('a negative plain-JSON usage is not a context size either', () => {
  const body = JSON.stringify({ usage: { input_tokens: -1, total_tokens: -2 } })
  assert.equal(extractTokenUsage(body), null)
})

test('a valid count is still returned', () => {
  const body = 'data: ' + JSON.stringify({ usage: { input_tokens: 42 } })
  assert.equal(extractTokenUsage(body), 42)
})
