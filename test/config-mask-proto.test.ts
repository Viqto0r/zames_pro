import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getByPath } from '../src/config.ts'
import { configListValue } from '../src/config-commands.ts'
import { translate } from '../src/i18n.ts'
import type { ConfigField } from '../src/config.ts'

const t = translate('en')

// `setByPath` refuses prototype keys, but `getByPath` walked them: the dotted
// path `__proto__` returned `Object.prototype` (an OBJECT), `constructor`
// returned the Object FUNCTION, and `toString` the function as well. The
// /config list renders every field with `getByPath(config, path)`; a field
// whose path went missing would then show `{}` (or `undefined` from a
// function's JSON.stringify) instead of the default marker. Reading
// prototype keys is never meaningful for a CONFIG path — it must behave like a
// missing key.
test('getByPath does not walk the prototype chain', () => {
  assert.equal(getByPath({}, '__proto__'), undefined)
  assert.equal(getByPath({}, 'constructor'), undefined)
  assert.equal(getByPath({}, 'toString'), undefined)
  assert.equal(getByPath({ a: {} }, 'a.__proto__'), undefined)
  // A real value is unchanged.
  assert.equal(getByPath({ a: { b: 1 } }, 'a.b'), 1)
})

test('a missing password field shows the default marker, not a secret', () => {
  const field = {
    path: 'browser.auth.password',
    type: 'string',
    labelKey: 'cfg.f.browser_auth_password',
    topKey: 'cfg.group.browser',
    groupKey: 'cfg.group.browser',
  } as ConfigField
  assert.equal(
    configListValue(field, getByPath({}, '__proto__'), t),
    t('cfg.menu.default'),
  )
})
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

const pwField = {
  path: 'browser.auth.password',
  type: 'string',
  labelKey: 'cfg.f.browser_auth_password',
  topKey: 'cfg.group.browser',
  groupKey: 'cfg.group.browser',
} as ConfigField

// The `/config` LIST masks a real secret. `/config get` deliberately does NOT
// mask a WHITESPACE-ONLY value (it cannot log in, and hiding it makes the
// operator think a password is configured) — but the list form used the raw
// `String(value).length > 0`, so a value of three spaces was shown as
// `********`: the operator saw "a password is set" while auto-login could
// never work. The two views must agree.
test('the config list does not mask a whitespace-only password', () => {
  assert.equal(configListValue(pwField, '   ', t), JSON.stringify('   '))
})

test('the config list still masks a real password', () => {
  assert.equal(configListValue(pwField, 'hunter2', t), '********')
  // An empty value is not a secret either (shown as an empty JSON string).
  assert.equal(configListValue(pwField, '', t), JSON.stringify(''))
})
