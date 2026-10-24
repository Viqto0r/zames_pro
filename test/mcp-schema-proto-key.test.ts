// jsonSchemaToParams() turns an MCP tool's JSON Schema into the flat param map
// the system prompt shows. Property names come from the SERVER and are
// arbitrary text: assigning to a plain object, a property literally named
// `__proto__` mutates the OBJECT'S PROTOTYPE instead of adding a key — the
// parameter silently disappears from the prompt (the model cannot call the
// tool correctly), and the object gets a stranger prototype. The same class of
// bug as the tool-count maps in /cost.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsonSchemaToParams } from '../src/mcp.ts'

test('a schema property named __proto__ becomes a real key', () => {
  const schema = JSON.parse(
    '{"type":"object","properties":{"__proto__":{"type":"string"},"ok":{"type":"number"}}}',
  )
  const out = jsonSchemaToParams(schema)
  assert.equal(
    Object.prototype.hasOwnProperty.call(out, '__proto__'),
    true,
    JSON.stringify(Object.keys(out)),
  )
  assert.equal((out as Record<string, string>)['__proto__'], 'string?')
  assert.equal((out as Record<string, string>)['ok'], 'number?')
})

test('a normal schema is unchanged', () => {
  const out = jsonSchemaToParams({
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  })
  assert.equal(out['path'], 'string')
})
