// The headless USER-AGENT fix is what keeps DeepSeek's CDN / Alibaba's WAF
// from answering a headless Chromium with a 403 or a login wall. Two defects
// made it a no-op in a REAL launch:
//   * the relaunch read the UA from the field it had just set, instead of
//     receiving the sanitized value explicitly;
//   * Qwen/GLM skipped the fix entirely whenever ANY UA was already set —
//     including the engine's own (marker-carrying) UA.
// `needsHeadlessUaFix` is the pure decision shared by all three providers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsHeadlessUaFix, sanitizeHeadlessUA } from '../src/browser-pure.ts'

const HEADLESS =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36'
const PLAIN =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36'

test('an empty UA still needs the fix (the engine value is unknown)', () => {
  assert.equal(needsHeadlessUaFix(''), true)
  assert.equal(needsHeadlessUaFix(null), true)
  assert.equal(needsHeadlessUaFix(undefined), true)
})

test('a marker-carrying UA needs the fix, even when it is set', () => {
  assert.equal(needsHeadlessUaFix(HEADLESS), true)
})

test('an already sanitized UA does not need the fix', () => {
  assert.equal(needsHeadlessUaFix(PLAIN), false)
  assert.equal(needsHeadlessUaFix(sanitizeHeadlessUA(HEADLESS)), false)
})

test('the fix removes the marker and keeps the engine version', () => {
  const fixed = sanitizeHeadlessUA(HEADLESS)
  assert.equal(fixed.includes('HeadlessChrome'), false)
  assert.ok(fixed.includes('Chrome/153.0.8010.12'))
  assert.equal(needsHeadlessUaFix(fixed), false)
})
