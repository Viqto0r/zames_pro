import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configListValue } from '../src/config-commands.ts'
import { translate } from '../src/i18n.ts'
import type { ConfigField } from '../src/config.ts'

const t = translate('en')
const pwField = {
  path: 'browser.auth.password',
  type: 'string',
  labelKey: 'cfg.f.browser_auth_password',
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
