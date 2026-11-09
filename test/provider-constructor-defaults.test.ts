import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QwenBrowser } from '../src/qwen-browser.ts'
import { GlmBrowser } from '../src/glm-browser.ts'
import { DeepSeekBrowser } from '../src/browser.ts'
import { DEFAULT_LOCALE } from '../src/i18n.ts'

// test/*-browser-surface.test.ts pins the notice/locale hooks. The CONSTRUCTOR
// itself — the default timings every provider boots with — had no test: a
// changed default (answerTimeoutMs, minSendIntervalMs, maxRetries, auth
// normalization, the derived askDeadlineMs) is invisible until a live run
// behaves differently. Nothing here touches Playwright: the constructor only
// assigns fields.

test('DeepSeek boots with its documented defaults', () => {
  const b = new DeepSeekBrowser()
  assert.equal(b.providerName, 'deepseek')
  assert.equal(b.headless, false)
  assert.equal(b.debug, false)
  assert.equal(b.channel, 'chrome')
  assert.equal(b.answerTimeoutMs, 180_000)
  assert.equal(b.askRetries, 3)
  assert.equal(b.infiniteRetries, true)
  assert.equal(b.maxRetryWaitMs, 1_800_000)
  assert.equal(b.stabilityChecks, 2)
  assert.equal(b.stabilityDelayMs, 400)
  assert.equal(b.minSendIntervalMs, 15_000)
  assert.equal(b.thinkingExtraMs, 2000)
  assert.equal(b.autoContinue, true)
  assert.equal(b.continueMinGapMs, 1500)
  assert.equal(b.loginTimeoutMs, 600_000)
  assert.equal(b.deepThinking, false)
  assert.equal(b.webSearch, true)
  assert.equal(b.locale, DEFAULT_LOCALE)
  // The watchdog deadline is NOT derived here (DeepSeek owns it in ask()).
  assert.equal('askDeadlineMs' in b, false)
})

test('DeepSeek normalizes auth and defaults the hooks to null', () => {
  const b = new DeepSeekBrowser({
    auth: { username: '  me  ', password: 'pw', saveSession: false },
  })
  assert.deepEqual(b.auth, {
    username: 'me',
    password: 'pw',
    saveSession: false,
  })
  assert.equal(b.onAuthSave, null)
  assert.equal(b.onLoginPrompt, null)
  assert.equal(b.onMfaPrompt, null)
  assert.equal(b.onContextLimit, null)
  const d = new DeepSeekBrowser()
  assert.deepEqual(d.auth, { username: '', password: '', saveSession: true })
})

test('DeepSeek keeps explicit option values verbatim', () => {
  const b = new DeepSeekBrowser({
    headless: true,
    debug: true,
    channel: 'chromium',
    answerTimeoutMs: 1000,
    askRetries: 0,
    infiniteRetries: false,
    maxRetryWaitMs: 5,
    stabilityChecks: 0,
    stabilityDelayMs: 0,
    minSendIntervalMs: 0,
    thinkingExtraMs: 0,
    autoContinue: false,
    continueMinGapMs: 0,
    loginTimeoutMs: 1,
    deepThinking: true,
    webSearch: false,
  })
  assert.equal(b.headless, true)
  assert.equal(b.debug, true)
  assert.equal(b.channel, 'chromium')
  assert.equal(b.answerTimeoutMs, 1000)
  assert.equal(b.askRetries, 0)
  assert.equal(b.infiniteRetries, false)
  assert.equal(b.maxRetryWaitMs, 5)
  assert.equal(b.stabilityChecks, 0)
  assert.equal(b.stabilityDelayMs, 0)
  assert.equal(b.minSendIntervalMs, 0)
  assert.equal(b.thinkingExtraMs, 0)
  assert.equal(b.autoContinue, false)
  assert.equal(b.continueMinGapMs, 0)
  assert.equal(b.loginTimeoutMs, 1)
  assert.equal(b.deepThinking, true)
  assert.equal(b.webSearch, false)
  // The toggles mirror the desired state at boot (nothing applied to the page
  // yet).
  assert.deepEqual(b._toggles, { deepThinking: true, webSearch: false })
})

test('Qwen boots with its defaults and derives the answer deadline', () => {
  const q = new QwenBrowser()
  assert.equal(q.providerName, 'qwen')
  assert.equal(q.headless, false)
  assert.equal(q.channel, null)
  assert.equal(q.answerTimeoutMs, 180_000)
  assert.equal(q.askRetries, 3)
  assert.equal(q.infiniteRetries, true)
  assert.equal(q.maxRetryWaitMs, 1_800_000)
  assert.equal(q.stabilityChecks, 2)
  assert.equal(q.stabilityDelayMs, 400)
  assert.equal(q.minSendIntervalMs, 15_000)
  assert.equal(q.rateLimitWaitMs, 300_000)
  assert.equal(q.maxRateLimitRetries, 6)
  assert.equal(q.maxServerBusyRetries, 5)
  assert.equal(q.serverBusyWaitMs, 3000)
  assert.equal(q.maxIncompleteRetries, 4)
  assert.equal(q.incompleteWaitMs, 2000)
  assert.equal(q.maxContextLimitRetries, 1)
  assert.equal(q.startWaitMs, 30_000)
  assert.equal(q.sendButtonWaitMs, 8000)
  // An EMPTY model id means "whatever the site picked" — never a hardcoded one.
  assert.equal(q.model, '')
  assert.equal(q.deepThinking, false)
  assert.equal(q.webSearch, true)
  assert.equal(q.locale, DEFAULT_LOCALE)
  assert.equal(q.loginTimeoutMs, 600_000)
  assert.equal(q.maxAfterToolRetries, 6)
  assert.deepEqual(q.auth, { username: '', password: '', saveSession: true })
  assert.equal(q.onContextLimit, null)
  assert.equal(q.onAuthSave, null)
  assert.equal(q.onLoginPrompt, null)
  // The watchdog budget is the answer timeout + 60s (a LARGER timeout must
  // move the deadline too, or the agent gives up first).
  assert.equal(q.askDeadlineMs, 240_000)
  assert.equal(new QwenBrowser({ answerTimeoutMs: 2000 }).askDeadlineMs, 62_000)
  // Qwen's mode menu is only driven on a CHANGE, so both start unset.
  assert.equal(q._appliedThinking, -1)
  assert.equal(q._appliedWebSearch, -1)
})

test('GLM boots with its own timings and a derived deadline', () => {
  const g = new GlmBrowser()
  assert.equal(g.providerName, 'glm')
  assert.equal(g.headless, false)
  // GLM's answer wait is deliberately longer than the other backends'.
  assert.equal(g.answerTimeoutMs, 300_000)
  assert.equal(g.askDeadlineMs, 360_000)
  assert.equal(g.askRetries, 3)
  assert.equal(g.infiniteRetries, true)
  assert.equal(g.maxRetryWaitMs, 1_800_000)
  assert.equal(g.stabilityChecks, 2)
  assert.equal(g.stabilityDelayMs, 400)
  // GLM's pause is ADAPTIVE, so the base interval starts at 0 and the runtime
  // decides the real one.
  assert.equal(g.minSendIntervalMs, 0)
  assert.equal(g.rateLimitWaitMs, 300_000)
  assert.equal(g.maxRateLimitRetries, 6)
  assert.equal(g.maxServerBusyRetries, 5)
  assert.equal(g.serverBusyWaitMs, 3000)
  assert.equal(g.maxIncompleteRetries, 4)
  assert.equal(g.incompleteWaitMs, 2000)
  assert.equal(g.maxContextLimitRetries, 1)
  assert.equal(g.startWaitMs, 30_000)
  assert.equal(g.sendButtonWaitMs, 8000)
  assert.equal(g.maxAfterToolRetries, 6)
  // z.ai's OWN agent runtime is neutralised by default and the deliberation
  // starts 'low': a live default, not an afterthought.
  assert.equal(g.disableAgentRuntime, true)
  assert.equal(g.reasoningEffort, 'low')
  // GLM ships with Deep thinking ON and web search OFF (z.ai's own defaults).
  assert.equal(g.deepThinking, true)
  assert.equal(g.webSearch, false)
  assert.equal(g.model, '')
  assert.equal(g.locale, DEFAULT_LOCALE)
  assert.equal(g.loginTimeoutMs, 600_000)
  assert.deepEqual(g.auth, { username: '', password: '', saveSession: true })
  assert.equal(g.onContextLimit, null)
  assert.equal(g.onAuthSave, null)
  assert.equal(g.onProviderExhausted, null)
  assert.equal(g.resumeChatId, null)
  assert.equal(g.compactInProgress, false)
  assert.equal(new GlmBrowser({ answerTimeoutMs: 5000 }).askDeadlineMs, 65_000)
})
