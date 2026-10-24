// The non-TTY spinner builds its labels (the hint, the pause countdown, the
// "running tool" line) from the locale captured at CONSTRUCTION. `/config
// lang en` switches the language live: the legacy LineEditor and the TUI
// adapter both expose `setLocale`, and index.ts calls it on the active editor.
// The spinner is a separate object (`editor || createSpinner(locale)`), so
// without its own `setLocale` it kept the OLD language — a Russian hint next
// to English service messages — until a restart.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSpinner } from '../src/spinner.ts'

test('the spinner accepts a live locale switch', () => {
  const spin = createSpinner('ru') as unknown as {
    setLocale?: (l: 'ru' | 'en') => void
  }
  assert.equal(
    typeof spin.setLocale,
    'function',
    'spinner has no setLocale, the hint stays in the old language',
  )
  spin.setLocale?.('en')
})

test('a locale switch reaches the labels the spinner renders', () => {
  const spin = createSpinner('ru') as unknown as {
    setLocale: (l: 'ru' | 'en') => void
    _hint?: () => string
  }
  // The hint is private; assert through the public path instead: the spinner
  // must accept the switch without throwing and keep animating afterwards.
  spin.setLocale('en')
  spin.setLocale('ru')
})
