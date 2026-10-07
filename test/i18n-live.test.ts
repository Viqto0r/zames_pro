import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LineEditor } from '../src/input.ts'
import { DeepSeekBrowser } from '../src/browser.ts'

const CYRILLIC = /[\u0400-\u04FF]/

function makeEditor(): LineEditor {
  const e = new LineEditor({ locale: 'en' })
  e._render = () => {}
  e._renderInputOnly = () => {}
  e.printAbove = () => {}
  return e
}

// The editor is created ONCE; a `/config lang` change calls setLocale(). The
// thinking phrase was hardcoded to the default locale, so the spinner stayed
// Russian even with the UI set to English (a real report). Guard that the
// phrase follows the editor's CURRENT locale.
test('thinking phrase follows the editor locale (no hardcoded ru)', () => {
  const e = makeEditor()
  let captured = ''
  e._startAnimated = ((text: string) => {
    captured = text
  }) as typeof e._startAnimated

  e._startThinking()
  assert.ok(captured.length > 0)
  assert.equal(
    CYRILLIC.test(captured),
    false,
    'english UI got a russian phrase',
  )

  e.setLocale('ru')
  e._startThinking()
  assert.equal(CYRILLIC.test(captured), true, 'russian UI should use russian')
})

// The browser is also created once and prints its own DeepSeek-side notices
// via _t(). Without setLocale() those notices stayed in the startup language.
test('browser.setLocale switches its own notice language', () => {
  const b = new DeepSeekBrowser({ locale: 'ru' })
  assert.equal(
    CYRILLIC.test(b._t('ds.incomplete_retry', { attempt: 1, max: 4 })),
    true,
  )
  b.setLocale('en')
  const en = b._t('ds.incomplete_retry', { attempt: 1, max: 4 })
  assert.equal(CYRILLIC.test(en), false, 'browser notice stayed russian')
})
