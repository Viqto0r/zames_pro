import { test } from 'node:test'
import assert from 'node:assert/strict'
import { translate } from '../src/i18n.js'

// CATALOG is a plain object, so a key that exists on Object.prototype
// ('toString', 'hasOwnProperty', 'valueOf' …) resolves to a FP�TCTION instead of a

// translation entry. A missing key must fall back to the KEY itself, not to
// the inherited member.
test('translate: an inherited prototype key is not a translation', () => {
  const t = translate('en')
  for (const key of ['toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(t(key), key)
    // With params it used to throw (the inherited function has no .replace).
    assert.equal(t(key, { x: 1 }), key)
  }
})

test('translate: a missing key returns the key and leaves placeholders', () => {
  const t = translate('en')
  assert.equal(t('no.such.key'), 'no.such.key')
  assert.equal(t('no.such.key', { a: 1 }), 'no.such.key')
})

test('translate: a known key interpolates only the params it has', () => {
  const t = translate('en')
  assert.equal(t('limits.window', { label: '10m' }), '10m: {n} sends')
})
