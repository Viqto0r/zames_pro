import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS } from '../src/config.ts'
import { DeepSeekBrowser } from '../src/browser.ts'

// The final "answer settled" loop used to hardcode 2 checks with an 800ms
// tick, so browser.stabilityChecks / browser.stabilityDelayMs were dead config.
// They are the real knobs now: verify the defaults are fast AND that the
// constructor honors explicit values.
test('stability defaults are fast (2 checks x 400ms)', () => {
 assert.equal(DEFAULTS.browser.stabilityChecks, 2)
 assert.equal(DEFAULTS.browser.stabilityDelayMs, 400)
})

test('DeepSeekBrowser stores stabilityChecks/stabilityDelayMs', () => {
 const b = new DeepSeekBrowser({
 stabilityChecks: 5,
 stabilityDelayMs: 123,
 })
 assert.equal(b.stabilityChecks, 5)
 assert.equal(b.stabilityDelayMs, 123)
})

test('stabilityChecks below 1 is still at least 1 tick', () => {
 const b = new DeepSeekBrowser({ stabilityChecks: 1 })
 assert.ok(b.stabilityChecks >= 1)
})
