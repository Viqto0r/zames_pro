import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyStoreLiveConfig } from '../src/config-live.ts'

// A live /config change is written STRAIGHT onto the store instance. Unlike
// `applyBrowserLiveConfig` (which validates its values), a negative or
// non-numeric `undo.maxBackups` was accepted as-is: the retention loop then
// shifts EVERY record out (negative budget) — `/undo` had nothing to revert —
// and a string value broke the numeric comparisons silently.

test('a negative maxBackups is not written live', () => {
  const undo = { enabled: true, maxBackups: 200 }
  assert.equal(applyStoreLiveConfig('undo.maxBackups', -5, { undo }), false)
  assert.equal(undo.maxBackups, 200)
})

test('a non-numeric maxBackups is not written live', () => {
  const undo = { enabled: true, maxBackups: 200 }
  assert.equal(applyStoreLiveConfig('undo.maxBackups', 'abc', { undo }), false)
  assert.equal(undo.maxBackups, 200)
})

test('a valid value is still applied', () => {
  const undo = { enabled: true, maxBackups: 200 }
  assert.equal(applyStoreLiveConfig('undo.maxBackups', 50, { undo }), true)
  assert.equal(undo.maxBackups, 50)
  assert.equal(applyStoreLiveConfig('undo.enabled', false, { undo }), true)
  assert.equal(undo.enabled, false)
})
