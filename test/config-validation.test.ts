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
// /config validates a NUMBER field against min/max but accepts a FRACTION.
// Every numeric setting in CONFIG_SCHEMA is a COUNT or a MILLISECOND amount
// consumed by code that treats it as an integer:
//   - `maxIterations` bounds a loop (`iterations < max`),
//   - `browser.askRetries` / `maxSubagents` / `undo.maxBackups` are attempt
//     budgets compared with a counter,
//   - `*IntervalMs` / timeouts are passed to setTimeout.
// `5.5` in a retry budget silently becomes "5 and a half attempts", and a
// fractional `maxSubagents: 0.4` makes `used >= max` false only until the
// first run — the budget prints `0.4` while refusing nothing consistently.
// The validator must reject a non-integer for a count/ms field.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIG_SCHEMA,
  getConfigField,
  validateConfigValue,
} from '../src/config.ts'

test('a fractional value is rejected for every numeric field', () => {
  const bad: string[] = []
  for (const f of CONFIG_SCHEMA) {
    if (f.type !== 'number') continue
    try {
      validateConfigValue(f, '5.5')
      bad.push(f.path)
    } catch {}
  }
  assert.deepEqual(bad, [], 'accepted a fraction for: ' + bad.join(', '))
})

test('an integer is still accepted', () => {
  const f = getConfigField('browser.askRetries')!
  assert.equal(validateConfigValue(f, '5'), 5)
})

test('a float-looking integer (5.0) is accepted as 5', () => {
  const f = getConfigField('maxIterations')!
  assert.equal(validateConfigValue(f, '5.0'), 5)
})
