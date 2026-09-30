import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfirmManager } from '../src/confirm.ts'

// Operator-facing strings used to be hardcoded in src/confirm.ts (the
// Russian «Разрешить», «да», «нет»). They now come from the i18n CATALOG, so
// `/config lang en` switches them too.
test('ConfirmManager picks the locale for its prompt label', () => {
  const ru = new ConfirmManager({ locale: 'ru' })
  const en = new ConfirmManager({ locale: 'en' })
  assert.equal(ru.locale, 'ru')
  assert.equal(en.locale, 'en')
  assert.equal(new ConfirmManager().locale, 'ru')
})

// An invalid alwaysConfirm regex must NOT crash the run. It falls back to
// a literal (escaped) substring match.
test('an invalid alwaysConfirm pattern does not throw', () => {
  const c = new ConfirmManager({
    config: { alwaysConfirm: ['[unclosed'] },
    locale: 'ru',
  })
  // The pattern was compiled (as a literal); matching must not throw.
  assert.equal(c._matchesAlwaysConfirm('rm -rf [unclosed dir'), true)
  assert.equal(c._matchesAlwaysConfirm('ls -la'), false)
})

test('a valid alwaysConfirm regex still works', () => {
  const c = new ConfirmManager({ config: { alwaysConfirm: ['^rm '] } })
  assert.equal(c._matchesAlwaysConfirm('rm -rf /tmp/x'), true)
  assert.equal(c._matchesAlwaysConfirm('git status'), false)
})

test('shouldAsk returns true for a matching bash alwaysConfirm', () => {
  const c = new ConfirmManager({
    config: { bash: false, alwaysConfirm: ['^rm '] },
  })
  assert.equal(c.shouldAsk('bash', 'rm -rf x'), true)
  assert.equal(c.shouldAsk('bash', 'ls'), false)
})
