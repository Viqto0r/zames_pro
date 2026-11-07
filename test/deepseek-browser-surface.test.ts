import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'
import { translate } from '../src/i18n.ts'

// The DeepSeek facade's page work needs a live Playwright browser, but its
// STATE-FREE surface does not: the constructor, the localization bound to the
// browser's locale and the two UI hooks. Those are what the operator sees
// after a /config lang change or when a UI callback throws, so they are pinned
// here (the GLM/Qwen equivalent lives in glm-browser-surface.test.ts).

function browser(over: Record<string, unknown> = {}): DeepSeekBrowser {
  return new DeepSeekBrowser({ headless: true, ...over } as never)
}

test('the provider name is deepseek and the locale defaults to the config', () => {
  const b = browser()
  assert.equal(b.providerName, 'deepseek')
  assert.equal(typeof b.locale, 'string')
})

test('_t uses the DeepSeek label for the shared messages', () => {
  const b = browser()
  b.setLocale('en')
  assert.equal(
    b._t('common.off'),
    translate('en')('common.off', { provider: 'DeepSeek' }),
  )
})

test('setLocale switches the language of the browser messages LIVE', () => {
  const b = browser()
  b.setLocale('en')
  const en = b._t('common.off')
  b.setLocale('ru')
  const ru = b._t('common.off')
  assert.notEqual(en, ru)
  assert.equal(b.locale, 'ru')
})

test('setLocale ignores an empty value', () => {
  const b = browser()
  b.setLocale('en')
  b.setLocale('' as never)
  assert.equal(b.locale, 'en')
})

test('_notice reaches the hook and a throwing hook is swallowed', () => {
  const b = browser()
  const seen: string[] = []
  b.onNotice = (t) => seen.push(t)
  b._notice('hi')
  assert.deepEqual(seen, ['hi'])
  b.onNotice = () => {
    throw new Error('boom')
  }
  const orig = console.error
  console.error = () => {}
  try {
    assert.doesNotThrow(() => b._notice('x'))
  } finally {
    console.error = orig
  }
})

test('_emitSendState forwards every state and swallows a throw', () => {
  const b = browser()
  const seen: string[] = []
  b.onSendState = (s) => seen.push(s)
  b._emitSendState('generating')
  b._emitSendState('paused')
  b._emitSendState('settled')
  assert.deepEqual(seen, ['generating', 'paused', 'settled'])
  b.onSendState = () => {
    throw new Error('boom')
  }
  assert.doesNotThrow(() => b._emitSendState('generating'))
})

test('an explicit user agent is sanitized of the Headless marker', () => {
  const b = browser({ userAgent: 'HeadlessChrome/120.0' })
  assert.equal(b.userAgent, 'Chrome/120.0')
})
