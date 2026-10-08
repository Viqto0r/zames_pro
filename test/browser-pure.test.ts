import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as pure from '../src/browser-pure.ts'
import * as browser from '../src/browser.ts'

// C3: the pure, state-free helpers were extracted from browser.ts into
// browser-pure.ts. browser.ts must RE-EXPORT them unchanged, so every existing
// importer (agent-loop, index, tests) keeps working and gets the SAME binding.

test('browser.ts re-exports the pure helpers by identity', () => {
  const names = [
    'askPassword',
    'parseHeadlessUACache',
    'headlessUACacheReady',
    'sanitizeHeadlessUA',
    'isGenerationIncompleteText',
    'isRateLimitText',
    'isServerBusyText',
    'normText',
    'RateLimitError',
    'ServerBusyError',
    'GenerationIncompleteError',
  ] as const
  for (const n of names) {
    assert.equal(
      (browser as Record<string, unknown>)[n],
      (pure as Record<string, unknown>)[n],
      `${n} is not the same binding in browser.ts and browser-pure.ts`,
    )
  }
})

test('browser-pure: the pure helpers behave (spot checks)', () => {
  assert.equal(pure.sanitizeHeadlessUA('HeadlessChrome/120'), 'Chrome/120')
  assert.equal(pure.normText('a  b\u00a0c'), 'a b c')
  assert.equal(pure.isRateLimitText('Messages too frequent.'), true)
  assert.equal(pure.isServerBusyText('Messages too frequent.'), false)
})
