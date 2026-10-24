// dedupeToolNames() makes every MCP tool name unique IN PLACE, because the
// agent resolves a call by name and takes the first match. It walks the list
// in order: a duplicate is renamed to `<name>_2`, `_3`, … — but ONLY against
// names seen SO FAR. A LATER tool that already owns `<name>_2` (a server's own
// `x_2` tool, or a second duplicate's real name) is then renamed to `<name>_2_2`
// (or `_3`), and the model's call to `x_2` reaches the RENAMED DUPLICATE — the
// wrong tool. The rename must avoid EVERY name in the list, not only the ones
// already visited.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeToolNames } from '../src/mcp.ts'

test('a duplicate rename does not steal a LATER tool name', () => {
  const tools = [{ name: 'a__x' }, { name: 'a__x' }, { name: 'a__x_2' }]
  dedupeToolNames(tools)
  const names = tools.map((t) => t.name)
  assert.deepEqual(new Set(names).size, names.length)
  // The REAL `a__x_2` must keep its name; the duplicate takes a free one.
  assert.equal(tools[2].name, 'a__x_2', JSON.stringify(names))
})

test('already-unique names are untouched', () => {
  const tools = [{ name: 'a__x' }, { name: 'b__y' }]
  dedupeToolNames(tools)
  assert.deepEqual(
    tools.map((t) => t.name),
    ['a__x', 'b__y'],
  )
})
