// Localization (i18n).
//
// Goals:
//   * change the interface language (help, service messages);
//   * the agent's answer language — via the system-prompt;
//   * the agent's answer language for a plain language.
//
// Strategy: a single key->translation map. New keys are easy to add.
// Russian texts (ru) are the default, English (en) is the alternative.

import { commonMessages } from './i18n/common.js'
import { helpMessages } from './i18n/help.js'
import { spinnerMessages } from './i18n/spinner.js'
import { doctorMessages } from './i18n/doctor.js'
import { deepseekMessages } from './i18n/deepseek.js'
import { selfReviewMessages } from './i18n/self-review.js'
import { mcpMessages } from './i18n/mcp.js'
import { configMessages } from './i18n/config.js'
import { promptMessages } from './i18n/prompt.js'

export type Locale = 'ru' | 'en'

export const DEFAULT_LOCALE: Locale = 'ru'

export interface LocaleInfo {
  code: Locale
  name: string
  englishName: string
}

export const LOCALES: LocaleInfo[] = [
  { code: 'ru', name: 'Русский', englishName: 'Russian' },
  { code: 'en', name: 'English', englishName: 'English' },
]

export function isLocale(v: unknown): v is Locale {
  return v === 'ru' || v === 'en'
}

export function normalizeLocale(v: unknown): Locale {
  if (!v) return DEFAULT_LOCALE
  const s = String(v).trim().toLowerCase()
  if (s === 'ru' || s === 'russian' || s === 'русский') return 'ru'
  if (s === 'en' || s === 'english' || s === 'английский') return 'en'
  return DEFAULT_LOCALE
}

export type TranslateParams = Record<string, string | number>

// String catalog. Key -> { ru, en }. If a key is missing we return the key itself.
// Split into section files (C3 step 1); merged here so callers keep importing
// CATALOG from a single place.
export const CATALOG: Record<string, { ru: string; en: string }> = {
  ...commonMessages,
  ...helpMessages,
  ...spinnerMessages,
  ...doctorMessages,
  ...deepseekMessages,
  ...selfReviewMessages,
  ...mcpMessages,
  ...configMessages,
  ...promptMessages,
}

export type TranslateFn = (key: string, params?: TranslateParams) => string

export function translate(locale: Locale): TranslateFn {
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE
  return (key: string, params?: TranslateParams): string => {
    const entry = CATALOG[key]
    const template = entry ? entry[loc] || entry[DEFAULT_LOCALE] : key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (m, name) => {
      return Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : m
    })
  }
}

export function localeDisplayName(locale: Locale): string {
  const found = LOCALES.find((l) => l.code === locale)
  return found ? found.name : locale
}
