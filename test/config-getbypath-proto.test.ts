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
