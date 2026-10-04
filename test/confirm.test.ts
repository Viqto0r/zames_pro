import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfirmManager } from '../src/confirm.ts'

test('defaults: every kind asks the first time', () => {
  const cm = new ConfirmManager()
  assert.equal(cm.shouldAsk('write'), true)
  assert.equal(cm.shouldAsk('edit'), true)
  assert.equal(cm.shouldAsk('bash', 'ls'), true)
})

test('a disabled kind never asks', () => {
  const cm = new ConfirmManager({
    config: { write: false, edit: false, bash: false },
  })
  assert.equal(cm.shouldAsk('write'), false)
  assert.equal(cm.shouldAsk('edit'), false)
  assert.equal(cm.shouldAsk('bash', 'rm -rf /'), false)
})

test('allow-for-session skips later asks', () => {
  const cm = new ConfirmManager()
  cm.allowedForSession.add('write')
  assert.equal(cm.shouldAsk('write'), false)
  assert.equal(cm.shouldAsk('edit'), true)
})

test('alwaysConfirm matches a bash command even when bash is disabled', () => {
  const cm = new ConfirmManager({
    config: { bash: false, alwaysConfirm: ['rm\\s+-rf'] },
  })
  assert.equal(cm.shouldAsk('bash', 'rm -rf node_modules'), true)
  assert.equal(cm.shouldAsk('bash', 'ls -la'), false)
})

test('alwaysConfirm only applies to bash, not to file writes', () => {
  const cm = new ConfirmManager({ config: { alwaysConfirm: ['rm'] } })
  assert.equal(cm._matchesAlwaysConfirm('rm'), true)
  assert.equal(cm.shouldAsk('write', 'rm'), true)
})

test('an invalid alwaysConfirm regex falls back to a literal match', () => {
  const cm = new ConfirmManager({ config: { alwaysConfirm: ['['] } })
  assert.equal(cm._matchesAlwaysConfirm('a [b] c'), true)
  assert.equal(cm._matchesAlwaysConfirm('no bracket here'), false)
})

test('alwaysConfirm is case-insensitive', () => {
  const cm = new ConfirmManager({ config: { alwaysConfirm: ['DELETE'] } })
  assert.equal(cm._matchesAlwaysConfirm('delete everything'), true)
})

test('setLocale updates the stored locale', () => {
  const cm = new ConfirmManager({ locale: 'ru' })
  assert.equal(cm.locale, 'ru')
  cm.setLocale('en')
  assert.equal(cm.locale, 'en')
})

test('default locale is ru', () => {
  const cm = new ConfirmManager()
  assert.equal(cm.locale, 'ru')
})
