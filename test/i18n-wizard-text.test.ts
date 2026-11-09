import { test } from 'node:test'
import assert from 'node:assert/strict'
import { translate, DEFAULT_LOCALE } from '../src/i18n.ts'
import { PROVIDER_IDS } from '../src/providers.ts'

// The first-run wizard is the FIRST thing a brand-new install sees, and its
// prompts state the DEFAULTS the operator gets on Enter. Those defaults live
// in three places at once — the prompt text (`(en)`, `(deepseek)`), the
// fallback the wizard code applies, and `DEFAULT_LOCALE` / the default
// provider — and they drifted silently before (a prompt promising `ru` while
// the code kept `en`). test/i18n.test.ts only checks that the keys EXIST in
// both languages; the CONTRACT they state was untested.

const KEYS = [
  'wizard.welcome',
  'wizard.language',
  'wizard.provider',
  'wizard.hint',
  'wizard.skipped',
]

test('every wizard line exists in both languages and differs', () => {
  for (const k of KEYS) {
    const en = translate('en')(k)
    const ru = translate('ru')(k)
    assert.ok(en.length > 0, k + ' is empty in en')
    assert.ok(ru.length > 0, k + ' is empty in ru')
    assert.notEqual(en, k, k + ' is missing from the catalog')
    assert.notEqual(en, ru, k + ' is the same in both languages')
    assert.match(ru, /[\u0400-\u04FF]/, k + ' has no Cyrillic in ru')
    assert.doesNotMatch(en, /[\u0400-\u04FF]/, k + ' has Cyrillic in en')
  }
})

test('the language prompt promises the REAL default locale', () => {
  // The prompt lists `[en/ru] (en)` and the wizard keeps the default on an
  // empty answer, so the parenthesised value must be DEFAULT_LOCALE.
  const en = translate('en')('wizard.language')
  const ru = translate('ru')('wizard.language')
  const re = new RegExp('\\(' + DEFAULT_LOCALE + '\\)')
  assert.match(en, re, en)
  assert.match(ru, re, ru)
  // Both offered locales are named.
  assert.match(en, /en\/ru/)
  assert.match(ru, /en\/ru/)
})

test('the provider prompt lists EVERY provider and the real default', () => {
  const en = translate('en')('wizard.provider')
  const ru = translate('ru')('wizard.provider')
  for (const id of PROVIDER_IDS) {
    assert.ok(en.includes(id), 'en prompt is missing ' + id + ': ' + en)
    assert.ok(ru.includes(id), 'ru prompt is missing ' + id + ': ' + ru)
  }
  // The default provider is DeepSeek (registry `isDefault`).
  assert.match(en, /\(deepseek\)/)
  assert.match(ru, /\(deepseek\)/)
})

test('the skipped line names the defaults it actually falls back to', () => {
  // Esc / a closed stdin keeps English + DeepSeek; the message must say so in
  // both languages, or the operator is told about a setting that did not
  // happen.
  const en = translate('en')('wizard.skipped')
  const ru = translate('ru')('wizard.skipped')
  assert.match(en, /English/)
  assert.match(en, /DeepSeek/)
  assert.match(ru, /английский/i)
  assert.match(ru, /DeepSeek/)
})

test('the hint points at /help and /config', () => {
  for (const loc of ['en', 'ru'] as const) {
    const s = translate(loc)('wizard.hint')
    assert.match(s, /\/help/)
    assert.match(s, /\/config/)
  }
})

test('the welcome line promises exactly the three steps it asks', () => {
  const en = translate('en')('wizard.welcome')
  const ru = translate('ru')('wizard.welcome')
  assert.match(en, /language/i)
  assert.match(en, /provider/i)
  assert.match(en, /sign-in/i)
  assert.match(ru, /язык/i)
  assert.match(ru, /провайдер/i)
  assert.match(ru, /вход/i)
})
