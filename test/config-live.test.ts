import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBrowserLiveConfig,
  applyStoreLiveConfig,
  BROWSER_LIVE_CONFIG,
} from '../src/config-live.ts'

test('applyBrowserLiveConfig: writes a known timing field', () => {
  const b: Record<string, unknown> = { minSendIntervalMs: 15000 }
  assert.equal(
    applyBrowserLiveConfig('browser.minSendIntervalMs', 5000, b),
    true,
  )
  assert.equal(b.minSendIntervalMs, 5000)
})

test('applyBrowserLiveConfig: skips a field absent on this backend', () => {
  // Qwen has no thinkingExtraMs; the write must be skipped, not thrown.
  const b: Record<string, unknown> = {}
  assert.equal(
    applyBrowserLiveConfig('browser.thinkingExtraMs', 1000, b),
    false,
  )
  assert.equal('browser.thinkingExtraMs' in b, false)
})

test('applyBrowserLiveConfig: rejects a non-browser path', () => {
  const b: Record<string, unknown> = {}
  assert.equal(applyBrowserLiveConfig('ui.locale', 'en', b), false)
})

test('BROWSER_LIVE_CONFIG: covers the documented timing knobs', () => {
  for (const p of [
    'browser.answerTimeoutMs',
    'browser.askRetries',
    'browser.minSendIntervalMs',
    'browser.autoContinue',
  ]) {
    assert.ok(p in BROWSER_LIVE_CONFIG, p)
  }
})

test('applyStoreLiveConfig: undo enabled/maxBackups', () => {
  const undo: Record<string, unknown> = { enabled: true, maxBackups: 200 }
  assert.equal(applyStoreLiveConfig('undo.enabled', false, { undo }), true)
  assert.equal(undo.enabled, false)
  assert.equal(applyStoreLiveConfig('undo.maxBackups', 5, { undo }), true)
  assert.equal(undo.maxBackups, 5)
})

test('applyStoreLiveConfig: checkpoint enabled/maxBackups', () => {
  const checkpoints: Record<string, unknown> = {
    enabled: true,
    maxBackups: 50,
  }
  assert.equal(
    applyStoreLiveConfig('checkpoint.enabled', false, { checkpoints }),
    true,
  )
  assert.equal(checkpoints.enabled, false)
})

test('applyStoreLiveConfig: missing store -> false', () => {
  assert.equal(applyStoreLiveConfig('undo.enabled', false, {}), false)
})

test('applyStoreLiveConfig: non-store path -> false', () => {
  assert.equal(applyStoreLiveConfig('ui.locale', 'en', {}), false)
})
