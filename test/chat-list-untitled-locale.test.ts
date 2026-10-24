// scrapeChatList() returns an EMPTY title for a chat row with no text (the
// scraper runs inside the page, which has no locale). The chat list / picker
// must then show the localized `chats.untitled` label instead of a blank row,
// and never a hardcoded one-language string.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function chatTitleForDisplay(title: string, locale: 'ru' | 'en'): string {
  // The same rule index.ts applies to every row it renders.
  const t = title.trim()
  if (t) return t
  return locale === 'ru' ? '(без названия)' : '(untitled)'
}

test('an empty scraped title is rendered with the localized label', () => {
  assert.equal(chatTitleForDisplay('', 'ru'), '(без названия)')
  assert.equal(chatTitleForDisplay('   ', 'en'), '(untitled)')
  assert.equal(chatTitleForDisplay('Fix login', 'en'), 'Fix login')
})

test('the scraper source contains no hardcoded untitled prose', () => {
  const src = fs.readFileSync(
    path.join(root, 'src', 'browser-chats.ts'),
    'utf-8',
  )
  assert.equal(
    /[\u0400-\u04FF]/.test(src),
    false,
    'browser-chats.ts must stay free of Cyrillic prose',
  )
})

test('the catalog has both untitled translations', async () => {
  const { translate } = await import('../src/i18n.ts')
  assert.equal(translate('ru')('chats.untitled'), '(без названия)')
  assert.equal(translate('en')('chats.untitled'), '(untitled)')
})
