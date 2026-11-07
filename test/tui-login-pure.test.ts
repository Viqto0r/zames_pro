import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskSecret, validateLogin } from '../src/tui/login-pure.ts'

// The login form's PURE validation/masking, pinned as a CONTRACT rather than a
// spot check: the function is called on every keystroke, so a change in the
// returned shape (the `reason` key drives the localized error line, the
// `field` decides which input gets focus) must fail here.

test('both fields empty: the username is reported first', () => {
  assert.deepEqual(validateLogin('', ''), {
    ok: false,
    field: 'user',
    reason: 'user',
  })
})

test('a filled password is accepted and focuses nothing', () => {
  assert.deepEqual(validateLogin('me', 'secret'), {
    ok: true,
    field: 'pass',
    reason: '',
  })
})

test('the username is trimmed, the password is NOT', () => {
  assert.equal(validateLogin('  me  ', ' p ').ok, true)
  // A password of only spaces is missing (the blank-password file covers the
  // reason); a NON-blank password keeps its surrounding spaces.
  assert.equal(validateLogin('me', '   ').ok, false)
  assert.equal(validateLogin('me', '  x  ').ok, true)
})

test('a whitespace-only username is missing, whatever the password', () => {
  assert.equal(validateLogin('\t\n', 'pw').field, 'user')
  assert.equal(validateLogin('\t\n', 'pw').reason, 'user')
})

test('a non-string input is treated as empty, not as "undefined"', () => {
  // A form field can be undefined before the first keystroke.
  assert.equal(validateLogin(undefined as never, 'pw').ok, false)
  assert.equal(validateLogin('me', undefined as never).ok, false)
})

test('maskSecret emits one star per CODE POINT', () => {
  assert.equal(maskSecret('abc'), '***')
  assert.equal(maskSecret('a😀b'), '***')
  assert.equal(maskSecret(''), '')
  assert.equal(maskSecret(undefined as never), '')
})

test('maskSecret never leaks the length in UTF-16 units', () => {
  // A single emoji is two UTF-16 units: `'*'.repeat(s.length)` would print TWO
  // stars for ONE typed character and let an onlooker count the code units.
  assert.equal(maskSecret('😀').length, 1)
})
