import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG_SCHEMA, DEFAULTS } from '../src/config.ts'

// `/config` reset (the `d` key in the menu, `/config reset <path>`) restores a
// field to its DEFAULT — read from DEFAULTS. A schema path that has no entry
// in DEFAULTS therefore cannot be reset: the key is deleted from the file and
// the code falls back to `undefined` instead of a real value.
function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const p of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

test('every config schema path has a DEFAULTS entry', () => {
  const missing = CONFIG_SCHEMA.filter(
    (f) => getByPath(DEFAULTS, f.path) === undefined,
  ).map((f) => f.path)
  assert.deepEqual(missing, [], 'no default for: ' + missing.join(', '))
})
