import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QwenBrowser } from '../src/qwen-browser.ts'

// `src/qwen-browser.ts` has no test file of its own (its lines are covered by
// the provider-surface tests, which drive a fake page). This file pins the
// part that a fake page never touches: the CONSTRUCTOR contract the agent
// loop, /config and /model read, and the few synchronous accessors that the
// TUI calls on every render. No Playwright is started.

test('the Qwen constructor installs the documented defaults', () => {
  const b = new QwenBrowser()
  assert.equal(b.providerName, 'qwen')
  assert.equal(b.headless, false)
  assert.equal(b.debug, false)
  assert.equal(b.channel, null)
  assert.equal(b.answerTimeoutMs, 180000)
  assert.equal(b.askRetries, 3)
  assert.equal(b.infiniteRetries, true)
  assert.equal(b.stabilityChecks, 2)
  assert.equal(b.minSendIntervalMs, 15000)
  assert.equal(b.maxRateLimitRetries, 6)
  assert.equal(b.maxServerBusyRetries, 5)
  assert.equal(b.maxIncompleteRetries, 4)
  assert.equal(b.maxContextLimitRetries, 1)
  assert.equal(b.startWaitMs, 30000)
  assert.equal(b.sendButtonWaitMs, 8000)
  assert.equal(b.loginTimeoutMs, 600000)
  assert.equal(b.model, '')
  assert.equal(b.deepThinking, false)
  assert.equal(b.webSearch, true)
  assert.equal(b.resumeChatId, null)
  assert.equal(b.compactInProgress, false)
})

test('the agent-loop budget is derived from the answer timeout', () => {
  assert.equal(new QwenBrowser().askDeadlineMs, 240000)
  assert.equal(new QwenBrowser({ answerTimeoutMs: 1000 }).askDeadlineMs, 61000)
  // maxAfterToolRetries is a fixed watchdog budget, not a constructor option.
  assert.equal(new QwenBrowser().maxAfterToolRetries, 6)
})

test('an auth block is trimmed, defaulted and copied', () => {
  const b = new QwenBrowser()
  assert.deepEqual(b.auth, { username: '', password: '', saveSession: true })
  const c = new QwenBrowser({
    auth: { username: '  me  ', password: ' pw ', saveSession: false },
  })
  // The username is trimmed; the password is NOT (leading spaces are part of
  // a secret) and `saveSession: false` is honoured.
  assert.deepEqual(c.auth, {
    username: 'me',
    password: ' pw ',
    saveSession: false,
  })
  // An explicit `true` is the same as leaving the field out.
  assert.equal(
    new QwenBrowser({
      auth: { username: 'x', password: '', saveSession: true },
    }).auth.saveSession,
    true,
  )
})

test('callbacks are stored as null when omitted, and the locale defaults', () => {
  const b = new QwenBrowser()
  assert.equal(b.onAuthSave, null)
  assert.equal(b.onLoginPrompt, null)
  assert.equal(b.onContextLimit, null)
  assert.equal(b.onProviderExhausted, null)
  assert.equal(b.onSendStart, null)
  assert.equal(b.onSendPause, null)
  assert.equal(b.onSendState, null)
  assert.equal(b.onNotice, null)
  assert.equal(b.locale, 'en')
  assert.equal(new QwenBrowser({ locale: 'ru' }).locale, 'ru')
})

test('the constructor options land on the instance verbatim', () => {
  const onContextLimit = async () => true
  const b = new QwenBrowser({
    headless: true,
    debug: true,
    channel: 'chrome',
    askRetries: 7,
    infiniteRetries: false,
    stabilityChecks: 5,
    minSendIntervalMs: 1,
    maxContextLimitRetries: 4,
    onContextLimit,
    model: 'qwen3-max',
    deepThinking: true,
    webSearch: false,
    userAgent: 'UA/1.0',
  })
  assert.equal(b.headless, true)
  assert.equal(b.debug, true)
  assert.equal(b.channel, 'chrome')
  assert.equal(b.askRetries, 7)
  assert.equal(b.infiniteRetries, false)
  assert.equal(b.stabilityChecks, 5)
  assert.equal(b.minSendIntervalMs, 1)
  assert.equal(b.maxContextLimitRetries, 4)
  assert.equal(b.onContextLimit, onContextLimit)
  assert.equal(b.model, 'qwen3-max')
  assert.equal(b.deepThinking, true)
  assert.equal(b.webSearch, false)
  assert.equal(b.userAgent, 'UA/1.0')
  // The toggles snapshot starts from the constructor values.
  assert.deepEqual(b.getToggleStatesSync(), {
    deepThinking: true,
    webSearch: false,
  })
})

test('the per-session flags start clean', () => {
  const b = new QwenBrowser()
  assert.equal(b._lastSentAt, 0)
  assert.equal(b._abort, false)
  assert.equal(b._askCancelled, false)
  assert.equal(b._askInFlight, 0)
  assert.equal(b._stopped, false)
  assert.equal(b._netCapture, '')
  assert.equal(b._netCaptureAt, 0)
  assert.equal(b._netNoAnswer, false)
  assert.equal(b._netRateLimited, false)
  assert.equal(b._netGuestLimit, false)
  assert.equal(b._netServerBusy, false)
  assert.equal(b._netContextLimit, false)
  assert.equal(b._netChatId, null)
  assert.equal(b._netBody, '')
  assert.equal(b._netHookInstalled, false)
  assert.equal(b._netHookPage, null)
  assert.equal(b._apiAuth, '')
  assert.equal(b._lastHistoryError, '')
  assert.equal(b._windowClosed, false)
  assert.equal(b._carryCookies, null)
  // -1 = "the desired mode was never applied this session", so the first send
  // DOES drive the mode menu.
  assert.equal(b._appliedThinking, -1)
  assert.equal(b._appliedWebSearch, -1)
})

test('getLastTokenUsage reports the last seen counter', () => {
  const b = new QwenBrowser()
  assert.equal(b.getLastTokenUsage(), null)
  b._lastTokenUsage = 1234
  assert.equal(b.getLastTokenUsage(), 1234)
  b._lastTokenUsage = 0
  assert.equal(b.getLastTokenUsage(), 0)
})

test('setToggleState writes only the booleans it was given', () => {
  const b = new QwenBrowser()
  b.setToggleState({ deepThinking: true })
  assert.deepEqual(b.getToggleStatesSync(), {
    deepThinking: true,
    webSearch: true,
  })
  b.setToggleState({ webSearch: false })
  assert.deepEqual(b.getToggleStatesSync(), {
    deepThinking: true,
    webSearch: false,
  })
  // A non-boolean is ignored (a malformed /config value must not poison it).
  b.setToggleState({ deepThinking: 'yes' as never, webSearch: 1 as never })
  assert.deepEqual(b.getToggleStatesSync(), {
    deepThinking: true,
    webSearch: false,
  })
  b.setToggleState({})
  assert.deepEqual(b.getToggleStatesSync(), {
    deepThinking: true,
    webSearch: false,
  })
})

test('getToggleStates reports the CONFIG values, not the live menu state', () => {
  const b = new QwenBrowser({ deepThinking: true, webSearch: false })
  // The live snapshot can drift (the operator flips the menu by hand); the
  // async reader keeps reporting what the config asked for.
  b.setToggleState({ deepThinking: false, webSearch: true })
  return b.getToggleStates().then((s) => {
    assert.deepEqual(s, { deepThinking: true, webSearch: false })
  })
})

test('setLocale ignores an empty value and keeps the current one', () => {
  const b = new QwenBrowser({ locale: 'ru' })
  b.setLocale('en')
  assert.equal(b.locale, 'en')
  b.setLocale('' as never)
  assert.equal(b.locale, 'en')
})

test('sendIntervalMs exposes the configured gap', () => {
  assert.equal(new QwenBrowser().sendIntervalMs(), 15000)
  assert.equal(new QwenBrowser({ minSendIntervalMs: 42 }).sendIntervalMs(), 42)
})

test('chatUrl builds the Qwen chat link without escaping the id', () => {
  const b = new QwenBrowser()
  assert.equal(
    b.chatUrl('2a2355b7-90b7-49b2-9c78-a7f59a44ea84'),
    'https://chat.qwen.ai/c/2a2355b7-90b7-49b2-9c78-a7f59a44ea84',
  )
  // Pinned as-is: the id is interpolated verbatim (it is a uuid in practice).
  assert.equal(b.chatUrl('a/b'), 'https://chat.qwen.ai/c/a/b')
})

test('cancelPendingAsk only raises the cancellation flag', () => {
  const b = new QwenBrowser()
  b.cancelPendingAsk()
  assert.equal(b._askCancelled, true)
  // It does not abort the transport and does not touch the stop flag.
  assert.equal(b._abort, false)
  assert.equal(b._stopped, false)
})

test('_cleanAnswer delegates to the shared answer cleaner', () => {
  const b = new QwenBrowser()
  // Only a SERVICE STATUS is dropped; every other answer is returned
  // VERBATIM (the tool-call parser relies on the original whitespace).
  assert.equal(b._cleanAnswer(''), '')
  assert.equal(b._cleanAnswer('   '), '')
  assert.equal(b._cleanAnswer('  plain  '), '  plain  ')
  assert.equal(b._cleanAnswer('Reading…'), '')
  assert.equal(b._cleanAnswer('  thinking. '), '')
  // The status check is anchored, so an answer that merely STARTS with the
  // word is kept as-is.
  assert.equal(b._cleanAnswer('Reading the file now'), 'Reading the file now')
})

test('_emitSendState forwards a state and swallows a throwing listener', () => {
  const seen: string[] = []
  const b = new QwenBrowser()
  b.onSendState = (s) => seen.push(s)
  b._emitSendState('generating')
  b._emitSendState('paused')
  b._emitSendState('settled')
  assert.deepEqual(seen, ['generating', 'paused', 'settled'])

  // A broken listener must never break the send path.
  const bad = new QwenBrowser()
  bad.onSendState = () => {
    throw new Error('boom')
  }
  assert.doesNotThrow(() => bad._emitSendState('generating'))
})

test('_notice prefers the listener and falls back to the console', () => {
  const seen: string[] = []
  const b = new QwenBrowser()
  b.onNotice = (t) => seen.push(t)
  b._notice('hello')
  assert.deepEqual(seen, ['hello'])

  const orig = console.error
  const logged: unknown[] = []
  console.error = (...a: unknown[]) => logged.push(a[0])
  try {
    const plain = new QwenBrowser()
    plain._notice('to stderr')
    const throwing = new QwenBrowser()
    throwing.onNotice = () => {
      throw new Error('boom')
    }
    throwing._notice('still printed')
  } finally {
    console.error = orig
  }
  assert.deepEqual(logged, ['to stderr', 'still printed'])
})

test('_t translates with the Qwen provider name substituted', () => {
  const b = new QwenBrowser({ locale: 'en' })
  // An unknown key is returned as the key itself, so the provider placeholder
  // is only visible on a real message; the call must not throw either way.
  assert.equal(typeof b._t('no.such.key'), 'string')
  const ru = new QwenBrowser({ locale: 'ru' })
  assert.equal(typeof ru._t('no.such.key'), 'string')
})

test('_uiCapabilities probes only the always-present controls', () => {
  const caps = new QwenBrowser()._uiCapabilities()
  const byName = new Map(caps.map((c) => [c.capability, c]))
  // The send button appears only after typing, so probing it would always be
  // a false negative; the INPUT is the critical control.
  assert.equal(byName.has('send'), false)
  assert.equal(byName.get('input')?.critical, true)
  assert.equal(byName.get('toggles')?.critical, false)
  assert.equal(byName.get('newChat')?.critical, false)
})

test('probeUiHealth without a page reports a clean failure', async () => {
  const b = new QwenBrowser()
  const res = await b.probeUiHealth()
  assert.deepEqual(res, {
    ok: false,
    present: [],
    missing: [],
    missingCritical: [],
  })
})

test('_readLastAnswerText serves the captured body when it is fresh', async () => {
  const b = new QwenBrowser()
  b._lastSentAt = 100
  b._netCapture = 'captured answer'
  b._netCaptureAt = 100
  // A page is deliberately absent: the cached body must short-circuit before
  // any DOM read, or this would throw.
  assert.equal(await b._readLastAnswerText(), 'captured answer')

  // A body captured BEFORE the last send is stale and must not be served.
  const stale = new QwenBrowser()
  stale._lastSentAt = 200
  stale._netCapture = 'old'
  stale._netCaptureAt = 100
  let domReads = 0
  stale._readLastAnswerTextDom = async () => {
    domReads++
    return 'from dom'
  }
  assert.equal(await stale._readLastAnswerText(), 'from dom')
  assert.equal(domReads, 1)
})
