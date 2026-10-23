import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBrowserLiveConfig,
  BROWSER_LIVE_CONFIG,
} from '../src/config-live.ts'

// `answerTimeoutMs` is not an independent knob on the Qwen/GLM browsers: their
// constructor DERIVES the watchdog from it (`askDeadlineMs = answerTimeoutMs +
// 60s`). `applyBrowserLiveConfig` pushed only the field named by the map, so
// `/config set qwen.answerTimeoutMs` (or `glm.answerTimeoutMs`, applied live
// through the generic timing branch in index.ts) changed the answer timeout
// while the DEADLINE kept the old value. With a larger timeout the agent gave
// up on a turn BEFORE the browser's own timeout — the operator saw "deadline
// exceeded" on a turn that was still allowed to run.
test('changing answerTimeoutMs live also moves the derived askDeadlineMs', () => {
  const browser: Record<string, unknown> = {
    answerTimeoutMs: 180000,
    askDeadlineMs: 240000,
    minSendIntervalMs: 15000,
  }
  const ok = applyBrowserLiveConfig('browser.answerTimeoutMs', 600000, browser)
  assert.equal(ok, true)
  assert.equal(browser.answerTimeoutMs, 600000)
  // The deadline must be re-derived (+60s), not left at the old value.
  assert.equal(browser.askDeadlineMs, 660000)
})

test('an unrelated knob does not touch the deadline', () => {
  const browser: Record<string, unknown> = {
    answerTimeoutMs: 180000,
    askDeadlineMs: 240000,
    askRetries: 3,
  }
  applyBrowserLiveConfig('browser.askRetries', 5, browser)
  assert.equal(browser.askRetries, 5)
  assert.equal(browser.askDeadlineMs, 240000)
})

test('the map still points answerTimeoutMs at its own field', () => {
  assert.equal(
    BROWSER_LIVE_CONFIG['browser.answerTimeoutMs'],
    'answerTimeoutMs',
  )
})
