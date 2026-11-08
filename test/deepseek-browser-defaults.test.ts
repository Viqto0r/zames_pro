import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'
import { DEFAULT_LOCALE } from '../src/i18n.ts'

// The STATE-FREE half of the DeepSeek facade: what the constructor stores when
// the caller passes NOTHING. These defaults decide the pacing of every send
// (minSendIntervalMs, retries, waits) and the auth shape, so a silent change
// there would throttle or un-throttle the operator without any test noticing.
// The page work (Playwright) is not touched.

function browser(over: Record<string, unknown> = {}): DeepSeekBrowser {
  return new DeepSeekBrowser(over as never)
}

test('an empty constructor keeps the documented pacing defaults', () => {
  const b = browser()
  assert.equal(b.headless, false)
  assert.equal(b.debug, false)
  assert.equal(b.channel, 'chrome')
  assert.equal(b.answerTimeoutMs, 180000)
  assert.equal(b.askRetries, 3)
  assert.equal(b.infiniteRetries, true)
  assert.equal(b.maxRetryWaitMs, 1800000)
  assert.equal(b.stabilityChecks, 2)
  assert.equal(b.stabilityDelayMs, 400)
  assert.equal(b.minSendIntervalMs, 15000)
  assert.equal(b.thinkingExtraMs, 2000)
  assert.equal(b.rateLimitWaitMs, 300000)
  assert.equal(b.maxRateLimitRetries, 6)
  assert.equal(b.maxServerBusyRetries, 5)
  assert.equal(b.loginTimeoutMs, 600000)
})

test('explicit options override the defaults field by field', () => {
  const b = browser({ minSendIntervalMs: 0, askRetries: 0, deepThinking: true })
  assert.equal(b.minSendIntervalMs, 0)
  assert.equal(b.askRetries, 0)
  assert.equal(b.deepThinking, true)
  assert.equal(b.webSearch, true)
  assert.deepEqual(b._toggles, { deepThinking: true, webSearch: true })
})

test('the auth block is normalized and saveSession defaults to true', () => {
  const b = browser({ auth: { username: '  user  ', password: ' pw ' } })
  assert.deepEqual(b.auth, {
    username: 'user',
    password: ' pw ',
    saveSession: true,
  })
  const off = browser({ auth: { saveSession: false } })
  assert.equal(off.auth.saveSession, false)
  assert.equal(off.auth.username, '')
  assert.equal(off.auth.password, '')
})

test('the runtime flags start clean and no hook is wired', () => {
  const b = browser()
  assert.equal(b._windowClosed, false)
  assert.equal(b._carryCookies, null)
  assert.equal(b._lastSentAt, 0)
  assert.equal(b._lastContinueAt, 0)
  assert.equal(b._abort, false)
  assert.equal(b._stopped, false)
  assert.equal(b._netCapture, '')
  assert.equal(b.onNotice, null)
  assert.equal(b.onSendState, null)
  assert.equal(b.onProviderExhausted, null)
  assert.equal(b.onContextLimit, null)
})

test('the locale and the user agent start empty by default', () => {
  const b = browser()
  assert.equal(b.locale, DEFAULT_LOCALE)
  assert.equal(b.userAgent, '')
})

test('autoContinue and continueMinGapMs keep their defaults', () => {
  const b = browser()
  assert.equal(b.autoContinue, true)
  assert.equal(b.continueMinGapMs, 1500)
  const off = browser({ autoContinue: false })
  assert.equal(off.autoContinue, false)
})
