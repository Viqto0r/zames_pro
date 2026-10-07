import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  translate,
  normalizeLocale,
  isLocale,
  localeDisplayName,
  DEFAULT_LOCALE,
  LOCALES,
  CATALOG,
} from '../src/i18n.ts'
import { commonMessages } from '../src/i18n/common.ts'
import { helpMessages } from '../src/i18n/help.ts'
import { spinnerMessages } from '../src/i18n/spinner.ts'
import { doctorMessages } from '../src/i18n/doctor.ts'
import { deepseekMessages } from '../src/i18n/deepseek.ts'
import { selfReviewMessages } from '../src/i18n/self-review.ts'
import { mcpMessages } from '../src/i18n/mcp.ts'
import { configMessages } from '../src/i18n/config.ts'
import { promptMessages } from '../src/i18n/prompt.ts'

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
  // Exhaustive: every catalog entry must carry a non-empty ru AND en string.
  // The old test sampled ~11 keys, so a key added on only one language was
  // never caught. Iterating CATALOG closes that gap.
  const keys = Object.keys(CATALOG)
  assert.ok(keys.length > 100, 'catalog looks suspiciously small')
  for (const k of keys) {
    const entry = CATALOG[k]
    assert.ok(entry, `missing entry: ${k}`)
    assert.equal(typeof entry.ru, 'string', `ru missing: ${k}`)
    assert.equal(typeof entry.en, 'string', `en missing: ${k}`)
    assert.ok(entry.ru.length > 0, `ru empty: ${k}`)
    assert.ok(entry.en.length > 0, `en empty: ${k}`)
  }
})

test('секции CATALOG не пересекаются по ключам', () => {
  // The catalog is merged with object spread, so a key present in two section
  // files silently keeps the LAST one and the other translation is dead. The
  // ru/en completeness test above cannot see that: it reads the merged CATALOG.
  const sections: Array<[string, Record<string, unknown>]> = [
    ['common', commonMessages],
    ['help', helpMessages],
    ['spinner', spinnerMessages],
    ['doctor', doctorMessages],
    ['deepseek', deepseekMessages],
    ['self-review', selfReviewMessages],
    ['mcp', mcpMessages],
    ['config', configMessages],
    ['prompt', promptMessages],
  ]
  const seen = new Map<string, string>()
  const duplicates: string[] = []
  for (const [name, messages] of sections) {
    for (const key of Object.keys(messages)) {
      const prev = seen.get(key)
      if (prev) duplicates.push(`${key} (${prev} + ${name})`)
      else seen.set(key, name)
    }
  }
  assert.deepEqual(duplicates, [], 'duplicate i18n keys across sections')
  // Sanity: every merged key came from exactly one section.
  assert.equal(seen.size, Object.keys(CATALOG).length)
})
