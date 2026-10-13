// Unit tests for the pure login-form helpers (src/tui/login-pure.ts).
// The masking and validation are what the Ink form relies on; testing them
// here keeps the component thin and the behavior terminal-independent.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskSecret, validateLogin } from '../src/tui/login-pure.ts'

test('maskSecret: one star per character (code-point aware)', () => {
  assert.equal(maskSecret('abc'), '***')
  assert.equal(maskSecret(''), '')
  // An emoji is ONE star, not two (Array.from splits by code point).
  assert.equal(maskSecret('a😀b'), '***')
})

test('validateLogin: both fields required', () => {
  assert.deepEqual(validateLogin('user', 'pass'), {
    ok: true,
    field: 'pass',
    reason: '',
  })
  const noUser = validateLogin('', 'pass')
  assert.equal(noUser.ok, false)
  assert.equal(noUser.reason, 'user')
  assert.equal(noUser.field, 'user')
  const noPass = validateLogin('user', '')
  assert.equal(noPass.ok, false)
  assert.equal(noPass.reason, 'pass')
})

test('validateLogin: a whitespace-only username is empty', () => {
  assert.equal(validateLogin('   ', 'x').ok, false)
})

test('validateLogin: a password keeps its spaces', () => {
  // "a b" is a legal password; only the username is trimmed.
  assert.equal(validateLogin('u', 'a b').ok, true)
})
