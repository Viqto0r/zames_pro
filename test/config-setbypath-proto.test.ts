// setByPath() walks a dot-path and creates missing objects. A `__proto__`
// (or `constructor` / `prototype`) segment must NOT be followed: assigning
// `cur['__proto__'] = {}` mutates the PROTOTYPE of the object — in-process
// code then sees injected properties, and (when the object is a config
// document) the polluting keys are silently written out.
// deepMerge() already skips these keys; setByPath did not.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getByPath, setByPath } from '../src/config.ts'

const POLLUTED = 'zames_proto_pollution_marker'

test('setByPath refuses to write through __proto__', () => {
  const o: Record<string, unknown> = {}
  setByPath(o, '__proto__.' + POLLUTED, 'yes')
  assert.equal(({} as Record<string, unknown>)[POLLUTED], undefined)
  assert.equal(
    Object.prototype.hasOwnProperty.call(Object.prototype, POLLUTED),
    false,
  )
  delete (Object.prototype as Record<string, unknown>)[POLLUTED]
})

test('setByPath refuses constructor/prototype segments', () => {
  const o: Record<string, unknown> = {}
  setByPath(o, 'constructor.prototype.' + POLLUTED, 'yes')
  assert.equal(({} as Record<string, unknown>)[POLLUTED], undefined)
  assert.equal(getByPath(o, 'constructor.prototype'), undefined)
  delete (Object.prototype as Record<string, unknown>)[POLLUTED]
})

test('setByPath still writes a normal nested path', () => {
  const o: Record<string, unknown> = {}
  setByPath(o, 'a.b.c', 1)
  assert.equal(getByPath(o, 'a.b.c'), 1)
})
