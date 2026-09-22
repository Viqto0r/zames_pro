import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  translate,
  normalizeLocale,
  isLocale,
  localeDisplayName,
  DEFAULT_LOCALE,
  LOCALES,
} from '../src/i18n.ts'

test('translate возвращает строку на нужном языке', () => {
  assert.equal(translate('ru')('common.yes'), 'да')
  assert.equal(translate('en')('common.yes'), 'yes')
})

test('translate подставляет параметры', () => {
  const s = translate('ru')('status.workdir', { v: '/tmp/x' })
  assert.ok(s.includes('/tmp/x'))
})

test('неизвестный ключ возвращается как есть', () => {
  assert.equal(translate('ru')('no.such.key'), 'no.such.key')
})

test('normalizeLocale понимает варианты', () => {
  assert.equal(normalizeLocale('EN'), 'en')
  assert.equal(normalizeLocale('Русский'), 'ru')
  assert.equal(normalizeLocale('english'), 'en')
  assert.equal(normalizeLocale('nonsense'), DEFAULT_LOCALE)
  assert.equal(normalizeLocale(undefined), DEFAULT_LOCALE)
})

test('isLocale / localeDisplayName', () => {
  assert.equal(isLocale('ru'), true)
  assert.equal(isLocale('de'), false)
  assert.equal(localeDisplayName('en'), 'English')
  assert.equal(localeDisplayName('ru'), 'Русский')
  assert.equal(LOCALES.length >= 2, true)
})

test('все ключи каталога имеют оба языка (ru/en)', () => {
  // Проверяем через выборку нескольких ключей из разных секций.
  const keys = [
    'help.options',
    'help.cmd.config',
    'spinner.hint',
    'prompt.answer_language',
    'cfg.usage',
    'self.review_hint',
    'msg.interactive',
  ]
  for (const k of keys) {
    const ru = translate('ru')(k)
    const en = translate('en')(k)
    assert.notEqual(ru, k, `ru missing: ${k}`)
    assert.notEqual(en, k, `en missing: ${k}`)
    assert.notEqual(ru, en, `ru/en identical for: ${k}`)
  }
})
