import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIG_SCHEMA,
  getConfigField,
  validateConfigValue,
} from '../src/config.ts'

// A `number` field is validated with `Number(raw)`. `Number('')` and
// `Number('   ')` are **0**, NOT NaN, so an EMPTY value for a field whose
// minimum is 0 passes validation and silently becomes 0. `/config set
// browser.maxIncompleteRetries ''` (or the menu edit buffer, which is trimmed
// to '' when the operator clears it) therefore DISABLED retries instead of
// rejecting the empty input. A number setting must reject an empty string.

test('an empty string is rejected for every number field', () => {
  for (const f of CONFIG_SCHEMA) {
    if (f.type !== 'number') continue
    assert.throws(
      () => validateConfigValue(f, ''),
      /number/,
      'empty value accepted for ' + f.path,
    )
    assert.throws(
      () => validateConfigValue(f, '   '),
      /number/,
      'blank value accepted for ' + f.path,
    )
  }
})

test('a real numeric value is still accepted', () => {
  const f = getConfigField('browser.maxIncompleteRetries')!
  assert.equal(validateConfigValue(f, '3'), 3)
  assert.equal(validateConfigValue(f, ' 3 '), 3)
})
