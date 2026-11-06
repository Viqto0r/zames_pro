import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskSecret, validateLogin } from '../src/tui/login-pure.ts'

// The login form must reject an EMPTY password with a clear message, but
// `!password` only catches the zero-length string: a password of SPACES (a
// paste that carried a trailing line, a stray space press) passed validation,
// the form submitted, and the browser answered "wrong password" — the operator
// was told the PASSWORD was wrong while the real problem was that nothing was
// typed. A password WITH leading/trailing spaces next to real characters is
// legal and must still pass (that rule is why the password is never trimmed).

test('a password of only whitespace is rejected as missing', () => {
  const v = validateLogin('user', '   ')
  assert.equal(v.ok, false)
  assert.equal(v.field, 'pass')
})

test('a password with real characters keeps its spaces and passes', () => {
  assert.deepEqual(validateLogin('user', ' pa ss '), {
    ok: true,
    field: 'pass',
    reason: '',
  })
})

test('an empty username is still rejected first', () => {
  assert.equal(validateLogin('   ', 'x').field, 'user')
})

test('a secret is masked by code points', () => {
  assert.equal(maskSecret('a😀'), '**')
  assert.equal(maskSecret(''), '')
})
