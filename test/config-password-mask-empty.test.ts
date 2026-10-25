import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configGetValue } from '../src/config-commands.ts'

// The mask triggers on `String(value).length > 0`, so a password of only
// WHITESPACE was masked too: the operator saw "a password is set" while
// auto-login could never work. A whitespace-only value must be shown as its
// real (empty-looking) JSON form, the same rule the list view follows.
test('a whitespace-only password is shown as its real (empty-looking) value', () => {
  const t = ((k: string) => k) as never
  assert.equal(configGetValue('browser.auth.password', '   ', t), '"   "')
})

test('a real password is masked', () => {
  const t = ((k: string) => k) as never
  assert.equal(
    configGetValue('browser.auth.password', 'hunter2', t),
    '********',
  )
})
