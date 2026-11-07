import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GlmBrowser } from '../src/glm-browser.ts'
import { QwenBrowser } from '../src/qwen-browser.ts'
import { translate } from '../src/i18n.ts'

// Both provider classes are Playwright facades, so their page work is covered
// by the provider smoke. The STATE-FREE surface a caller relies on is not:
// localization (a /provider switch must relabel the notices), the NOTICE and
// SEND-STATE hooks (a throwing callback must never break a send), and the
// interval a provider reports (the adaptive throttle). A live page is never
// touched: the constructor and the setters need none.

function glm(): GlmBrowser {
  return new GlmBrowser({ headless: true } as never)
}

function qwen(): QwenBrowser {
  return new QwenBrowser({ headless: true } as never)
}

test('_t localizes with the provider label injected', () => {
  const b = glm()
  b.setLocale('en')
  const en = b._t('common.off')
  b.setLocale('ru')
  const ru = b._t('common.off')
  assert.equal(typeof en, 'string')
  assert.equal(typeof ru, 'string')
  assert.notEqual(en, ru)
})

test('setLocale ignores an empty value and keeps the previous locale', () => {
  const b = glm()
  b.setLocale('en')
  b.setLocale('' as never)
  assert.equal(b.locale, 'en')
})

test('_notice reaches the injected hook', () => {
  const b = glm()
  const seen: string[] = []
  b.onNotice = (t2) => seen.push(t2)
  b._notice('hello')
  assert.deepEqual(seen, ['hello'])
})

test('a THROWING notice hook does not break the caller', () => {
  const b = glm()
  b.debug = false
  b.onNotice = () => {
    throw new Error('boom')
  }
  // Falls through to console.error; the point is that it does not throw.
  const orig = console.error
  console.error = () => {}
  try {
    assert.doesNotThrow(() => b._notice('x'))
  } finally {
    console.error = orig
  }
})

test('_emitSendState forwards the state and swallows a throwing hook', () => {
  const b = glm()
  const seen: string[] = []
  b.onSendState = (s) => seen.push(s)
  b._emitSendState('generating')
  b._emitSendState('settled')
  assert.deepEqual(seen, ['generating', 'settled'])
  b.onSendState = () => {
    throw new Error('boom')
  }
  assert.doesNotThrow(() => b._emitSendState('paused'))
})

test('a provider reports the interval of its send runtime', () => {
  const b = glm()
  assert.equal(typeof b.sendIntervalMs(), 'number')
  assert.ok(b.sendIntervalMs() >= 0)
})

test('both providers default to the localized labels of their own id', () => {
  const g = glm()
  const q = qwen()
  g.setLocale('en')
  q.setLocale('en')
  // The provider label is injected into the message: the two must differ.
  const msg = 'common.off'
  assert.equal(g._t(msg), translate('en')(msg, { provider: 'GLM' }))
  assert.equal(q._t(msg), translate('en')(msg, { provider: 'Qwen' }))
})
