import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

// D2: the "did the answer start?" loop used to read
// document.body.innerText.length every tick (expensive on a long chat).
// _chatSignal() returns a cheap growth signal (message node count + last
// answer length).

test('_chatSignal returns the page decision', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = {
    async evaluate() {
      return { nodes: 5, lastLen: 42 }
    },
  }
  const sig = await b._chatSignal()
  assert.deepEqual(sig, { nodes: 5, lastLen: 42 })
})

test('_chatSignal never throws (falls back to zeros)', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = {
    async evaluate() {
      throw new Error('page gone')
    },
  }
  const sig = await b._chatSignal()
  assert.deepEqual(sig, { nodes: 0, lastLen: 0 })
})
