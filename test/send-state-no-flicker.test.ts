import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The status row shows a phase badge from `onSendState`. Emitting 'settled'
// right before the next send flips it back to 'generating' made the badge (and
// the row width) change twice per turn — the interface "flicker" the operator
// reported. These are SOURCE-level pins: the provider must only ANNOUNCE a
// phase it keeps, never a transient one.
const SRC = readFileSync(new URL('../src/browser.ts', import.meta.url), 'utf8')

test('the send slot never announces a settled phase (nothing was sent yet)', () => {
  const i = SRC.indexOf('async _waitForSendSlot')
  assert.ok(i > 0)
  const body = SRC.slice(i, SRC.indexOf('async _sleepInterruptible', i))
  assert.ok(!body.includes("_emitSendState('settled')"), body)
  assert.ok(body.includes("_emitSendState('generating')"), body)
})

test('ask() does not emit settled just before returning the answer', () => {
  const i = SRC.indexOf('async ask(')
  assert.ok(i > 0)
  const body = SRC.slice(i, i + 12000)
  assert.ok(!body.includes("_emitSendState('settled')"))
})

test('the rate-limit wait returns to generating when it ends', () => {
  const i = SRC.indexOf('async _waitRateLimit')
  assert.ok(i > 0)
  const body = SRC.slice(i, SRC.indexOf('async _sleepInterruptible', i))
  assert.ok(body.includes("_emitSendState('generating')"), body)
})
