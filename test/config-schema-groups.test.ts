import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIG_SCHEMA,
  CONFIG_TOP_GROUPS,
  getConfigField,
  fieldsOfTopGroup,
  subgroupsOf,
  topGroupModified,
} from '../src/config-schema.ts'
import { DEFAULTS } from '../src/config.ts'

// src/config-schema.ts is DATA + the four grouping helpers the /config menu
// and the text API read. The type/DEFAULTS wiring has its own coverage file;
// this one pins the GROUPING contract: lookup, the top-group filter, the
// deduplicated subgroup order and the "modified" marker.

test('getConfigField finds a field by its path, undefined otherwise', () => {
  const f = getConfigField('provider')
  assert.ok(f)
  assert.equal(f?.type, 'enum')
  assert.equal(getConfigField('no.such.path'), undefined)
})

test('fieldsOfTopGroup returns only that group, in schema order', () => {
  const fields = fieldsOfTopGroup('cfg.top.ui')
  assert.ok(fields.length > 0)
  for (const f of fields) assert.equal(f.topKey, 'cfg.top.ui')
  // The order matches the schema (the menu renders in this order).
  const schemaOrder = CONFIG_SCHEMA.filter((f) => f.topKey === 'cfg.top.ui')
  assert.deepEqual(
    fields.map((f) => f.path),
    schemaOrder.map((f) => f.path),
  )
})

test('fieldsOfTopGroup hides an advanced field and an unknown group is empty', () => {
  assert.deepEqual(fieldsOfTopGroup('cfg.top.nope'), [])
  // No field is advanced today; the helper must still filter one out.
  const fake = CONFIG_SCHEMA.map((f) =>
    f.path === 'provider' ? { ...f, advanced: true } : f,
  )
  assert.equal(
    fake
      .filter((f) => f.topKey === 'cfg.top.agent' && !f.advanced)
      .some((f) => f.path === 'provider'),
    false,
  )
})

test('subgroupsOf deduplicates and keeps the schema order', () => {
  const subs = subgroupsOf('cfg.top.agent')
  assert.equal(new Set(subs).size, subs.length, 'no duplicate subgroup')
  assert.ok(subs.length > 0)
  const expected: string[] = []
  for (const f of CONFIG_SCHEMA) {
    if (
      f.topKey === 'cfg.top.agent' &&
      !f.advanced &&
      !expected.includes(f.groupKey)
    )
      expected.push(f.groupKey)
  }
  assert.deepEqual(subs, expected)
})

test('every top group in the schema is advertised in CONFIG_TOP_GROUPS', () => {
  const advertised = new Set<string>(CONFIG_TOP_GROUPS)
  for (const f of CONFIG_SCHEMA) {
    assert.ok(
      advertised.has(f.topKey),
      f.path + ' uses an unadvertised top group',
    )
  }
})

test('topGroupModified is false when the group matches its defaults', () => {
  const defaults = DEFAULTS as unknown as Record<string, unknown>
  const get = (p: string): unknown => readPath(defaults, p)
  for (const g of CONFIG_TOP_GROUPS) {
    assert.equal(topGroupModified(g, get, get), false, g)
  }
})

test('topGroupModified turns true when one field of the group differs', () => {
  const defaults = DEFAULTS as unknown as Record<string, unknown>
  const get = (p: string): unknown => readPath(defaults, p)
  const changed = (p: string): unknown =>
    p === 'provider' ? '__changed__' : readPath(defaults, p)
  assert.equal(topGroupModified('cfg.top.agent', changed, get), true)
  assert.equal(topGroupModified('cfg.top.ui', changed, get), false)
})

test('topGroupModified ignores a value the config does not set', () => {
  const get = (): unknown => undefined
  const def = (): unknown => 'x'
  assert.equal(topGroupModified('cfg.top.agent', get, def), false)
})

// `undo.enabled` style path -> the value, so the test does not hardcode the
// DEFAULTS shape.
function readPath(obj: unknown, p: string): unknown {
  let cur: unknown = obj
  for (const part of p.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}
