import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  translate,
  isLocale,
  normalizeLocale,
  DEFAULT_LOCALE,
} from '../src/i18n.ts'

// test/i18n.test.ts pins the catalog CONTENTS (both languages, no duplicate
// keys). The `translate()` RESOLVER itself — the function every operator-visible
// line goes through — was only spot-checked: one key, one param. Its edge
// behaviour decides whether a value is printed at all.

const en = translate('en')
const ru = translate('ru')

test('a present param is substituted, a missing one leaves the placeholder', () => {
  assert.equal(en('status.workdir', { v: '/x' }), 'Working directory: /x')
  assert.equal(en('status.workdir', {}), 'Working directory: {v}')
  assert.equal(en('status.workdir'), 'Working directory: {v}')
  // A param with a DIFFERENT name does not fill `{v}`.
  assert.equal(en('status.workdir', { w: 'x' }), 'Working directory: {v}')
})

test('every placeholder of a multi-param key is replaced', () => {
  assert.equal(en('limits.window', { label: '10m', n: 3 }), '10m: 3 sends')
  assert.equal(ru('limits.window', { label: '10m', n: 3 }), '10m: 3 отправок')
})

test('a NUMBER param is stringified', () => {
  assert.equal(en('status.workdir', { v: 5 }), 'Working directory: 5')
  assert.equal(en('status.workdir', { v: 0 }), 'Working directory: 0')
})

// The replacement goes through String.replace, so `$&`/`$1`-style values are a
// classic corruption source. The callback form must keep them LITERAL — a
// path or a model name containing `$` is printed as-is.
test('a `$`-pattern in a value is printed literally, not expanded', () => {
  assert.equal(en('status.workdir', { v: '$&' }), 'Working directory: $&')
  assert.equal(en('status.workdir', { v: '$1$`' }), 'Working directory: $1$`')
  // A value that itself looks like a placeholder is NOT re-expanded.
  assert.equal(en('status.workdir', { v: '{v}' }), 'Working directory: {v}')
})

test('an unknown key is returned verbatim (never throws)', () => {
  assert.equal(en('no.such.key'), 'no.such.key')
  assert.equal(en('no.such.key', { v: 'x' }), 'no.such.key')
})

// A bare-object lookup resolves Object.prototype members; `translate` must only
// accept an OWN catalog entry, or `toString`/`constructor` would be returned as
// an inherited FUNCTION.
test('an inherited Object key is not a translation', () => {
  for (const key of [
    'toString',
    'constructor',
    'hasOwnProperty',
    '__proto__',
  ]) {
    assert.equal(en(key), key)
    assert.equal(typeof en(key), 'string')
  }
})

test('each locale reads its OWN text, and both differ', () => {
  const k = 'status.workdir'
  assert.equal(en(k, { v: '/x' }), 'Working directory: /x')
  assert.equal(ru(k, { v: '/x' }), 'Рабочая директория: /x')
  assert.notEqual(en(k, { v: '/x' }), ru(k, { v: '/x' }))
})

test('an invalid locale falls back to the default one', () => {
  const bad = translate('de' as never)
  assert.equal(
    bad('status.workdir', { v: '/x' }),
    en('status.workdir', { v: '/x' }),
  )
  assert.equal(DEFAULT_LOCALE, 'en')
})

test('isLocale / normalizeLocale accept only real locales', () => {
  assert.equal(isLocale('ru'), true)
  assert.equal(isLocale('en'), true)
  assert.equal(isLocale('EN'), false)
  assert.equal(isLocale(undefined), false)
  assert.equal(normalizeLocale(' EN '), 'en')
  assert.equal(normalizeLocale('Русский'), 'ru')
  assert.equal(normalizeLocale(''), DEFAULT_LOCALE)
  assert.equal(normalizeLocale(null), DEFAULT_LOCALE)
})
