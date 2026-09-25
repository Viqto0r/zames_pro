import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

test('browser: deepThinking/webSearch come from options, defaults are sane', () => {
  const def = new DeepSeekBrowser()
  assert.equal(def.deepThinking, false)
  assert.equal(def.webSearch, true)

  const custom = new DeepSeekBrowser({ deepThinking: true, webSearch: false } as any)
  assert.equal(custom.deepThinking, true)
  assert.equal(custom.webSearch, false)
})

test('browser: _applyToggles is a no-op without a page', async () => {
  const b = new DeepSeekBrowser()
  await b._applyToggles()
  assert.ok(true)
})
