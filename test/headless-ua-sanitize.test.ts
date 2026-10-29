// The USER-AGENT guard is what keeps a headless Chromium from being answered
// with a 403 / captcha by DeepSeek's CDN, Alibaba's WAF (Qwen) and z.ai. Its
// contract is narrow and load-bearing: strip ONLY the `HeadlessChrome` marker
// (the real engine version must survive, or the UA looks like a fake) and leave
// an explicitly configured UA alone (the callers skip the fix when one is set).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeHeadlessUA } from '../src/browser-pure.ts'

test('sanitizeHeadlessUA drops only the Headless marker', () => {
  const ua =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36'
  const out = sanitizeHeadlessUA(ua)
  assert.equal(out.includes('HeadlessChrome'), false, out)
  assert.ok(out.includes('Chrome/153.0.8010.12'), out)
  assert.equal(out, ua.replace('HeadlessChrome', 'Chrome'))
})

test('sanitizeHeadlessUA leaves a plain Chrome UA untouched', () => {
  const ua =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36'
  assert.equal(sanitizeHeadlessUA(ua), ua)
})

test('an empty UA stays empty (never becomes a fake "Chrome")', () => {
  assert.equal(sanitizeHeadlessUA(''), '')
})
