// applyBrowserLiveConfig() pushes a `browser.*` value onto the LIVE browser
// instance. It wrote the value AS-IS, so a bad value reached a running field:
// a NaN/negative timeout makes the internal timer fire immediately, and
// `answerTimeoutMs = 0` SKIPPED the derived `askDeadlineMs` update, leaving a
// stale deadline that no longer matches the timeout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBrowserLiveConfig } from '../src/config-live.ts'

test('a non-finite or negative timing value is not pushed to the browser', () => {
  const b: Record<string, unknown> = {
    minSendIntervalMs: 15000,
    stabilityDelayMs: 400,
  }
  assert.equal(
    applyBrowserLiveConfig('browser.minSendIntervalMs', -1, b),
    false,
  )
  assert.equal(b.minSendIntervalMs, 15000)
  assert.equal(
    applyBrowserLiveConfig('browser.stabilityDelayMs', NaN, b),
    false,
  )
  assert.equal(b.stabilityDelayMs, 400)
})

test('a valid value is still applied (control)', () => {
  const b: Record<string, unknown> = { minSendIntervalMs: 15000 }
  assert.equal(
    applyBrowserLiveConfig('browser.minSendIntervalMs', 5000, b),
    true,
  )
  assert.equal(b.minSendIntervalMs, 5000)
})

test('a non-positive answerTimeout does not leave a stale deadline', () => {
  const b: Record<string, unknown> = {
    answerTimeoutMs: 300000,
    askDeadlineMs: 360000,
  }
  // A 0 is FINITE, so it is pushed — but then the derived deadline must be
  // re-derived too (0 + 60s), never left at the old 360000.
  applyBrowserLiveConfig('browser.answerTimeoutMs', 0, b)
  assert.equal(b.answerTimeoutMs, 0)
  assert.equal(b.askDeadlineMs, 60_000)
})
