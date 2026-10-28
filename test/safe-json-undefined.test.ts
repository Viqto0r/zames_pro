// The tool lines in the terminal print `safeJson(args)` / `safeJson(result)`.
// `JSON.stringify(undefined)` returns the VALUE `undefined` (not a string),
// and the old helper returned it as-is — typed as string but not one, so
// `truncateToWidth(undefined, …)` and the `detail ? …` checks all took the
// wrong branch. A REPL tool (or an args-less call) rendered the literal
// "undefined" instead of its arguments (mcp.ts already special-cases this).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeJson } from '../src/input/layout.ts'

test('safeJson(undefined) is a STRING, not the value undefined', () => {
  const out = safeJson(undefined)
  assert.equal(typeof out, 'string')
  assert.equal(out, 'undefined')
})

test('safeJson keeps normal JSON', () => {
  assert.equal(safeJson({ a: 1 }), '{"a":1}')
  assert.equal(safeJson('text'), '"text"')
})

test('safeJson survives a cycle', () => {
  const o: Record<string, unknown> = {}
  o.self = o
  assert.equal(typeof safeJson(o), 'string')
})
