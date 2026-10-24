import test from 'node:test'
import assert from 'node:assert/strict'
import { describeParamsExternally, jsonSchemaToParams } from '../src/mcp.ts'

// The SAME condition guards both halves of the schema rendering, and it was
// too strict: `type !== 'object'` returns early, so a schema whose top-level
// `type` is a LIST (`type: ['object']` — what a zod-derived JSON Schema or a
// nullable wrapper emits) never reached the model at all. The flat parameter
// map still listed the fields, so the model saw `path: string` with NO
// description and NO enum — exactly the enums that MCP tools such as
// browser_click depend on ("element is one of …"), and the field
// descriptions that say what to pass.
const UNION_TYPE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: ['object'],
  properties: {
    element: { type: 'string', description: 'human readable element name' },
    level: { type: 'integer', enum: [1, 2, 3] },
  },
  required: ['element'],
}

test('describeParamsExternally keeps the schema when type is ["object"]', () => {
  const out = describeParamsExternally('Do a thing', UNION_TYPE_SCHEMA)
  assert.ok(
    out.includes('JSON Schema:'),
    'the schema was dropped from the description: ' + out,
  )
  assert.ok(out.includes('human readable element name'))
  assert.ok(out.includes('[1,2,3]'))
})

test('describeParamsExternally still skips a non-object schema', () => {
  const out = describeParamsExternally('Do a thing', { type: 'string' })
  assert.equal(out, 'Do a thing')
})

test('jsonSchemaToParams reads properties from the union-typed schema', () => {
  assert.deepEqual(
    { ...jsonSchemaToParams(UNION_TYPE_SCHEMA) },
    {
      element: 'string',
      level: 'value?',
    },
  )
})
