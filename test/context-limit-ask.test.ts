import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QwenBrowser } from '../src/qwen-browser.ts'
import { GlmBrowser } from '../src/glm-browser.ts'

// The exhausted-context recovery must NOT retry in place: the chat refuses
// every send, so ask() calls onContextLimit (which compacts into a fresh chat)
// and only then resends. Without the callback it fails with a clear message
// instead of burning the retry budget on a dead chat.

test('qwen/glm: the recovery seam defaults to off', () => {
  const q = new QwenBrowser()
  assert.equal(q.onContextLimit, null)
  assert.equal(q.maxContextLimitRetries, 1)
  const g = new GlmBrowser()
  assert.equal(g.onContextLimit, null)
  assert.equal(g.maxContextLimitRetries, 1)
})

test('qwen: the callback is attachable and survives a direct call', async () => {
  const q = new QwenBrowser()
  let called = 0
  q.onContextLimit = async () => {
    called++
    return true
  }
  assert.equal(await q.onContextLimit(), true)
  assert.equal(called, 1)
})

test('glm: the callback is attachable and survives a direct call', async () => {
  const g = new GlmBrowser()
  let called = 0
  g.onContextLimit = async () => {
    called++
    return false
  }
  assert.equal(await g.onContextLimit(), false)
  assert.equal(called, 1)
})
