import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseXmlToolCalls } from '../src/xml-toolcall.ts'
import { parseToolCall } from '../src/answer-parse.ts'

// Hybrid form: the tool name is an attribute AND the args are inline JSON in
// the SAME opening tag. The finder tried the generic `{` BEFORE the specific
// `"args" {`, so a stray brace in the surrounding prose (`note {here}: {…}`)
// was taken as the JSON start: balance ended on its `}`, the parsed "object"
// carried no arguments, and the call reached the tool with EMPTY args.

const Q = String.fromCharCode(34)
const E = '<'

test('a stray brace before the inline JSON does not eat the args', () => {
  const text =
    E +
    'invoke name=' +
    Q +
    'Write' +
    Q +
    ' ' +
    Q +
    'args' +
    Q +
    ' note {here}: {' +
    Q +
    'path' +
    Q +
    ':' +
    Q +
    'a.ts' +
    Q +
    ',' +
    Q +
    'content' +
    Q +
    ':' +
    Q +
    'x' +
    Q +
    '}>'
  const res = parseToolCall(text)
  const call = Array.isArray(res) ? res[0] : res
  assert.ok(call)
  assert.equal(call.args['path'], 'a.ts')
  assert.equal(call.args['content'], 'x')
})

test('a plain hybrid call is still parsed', () => {
  const text =
    E +
    'invoke name=' +
    Q +
    'Write' +
    Q +
    ' ' +
    Q +
    'args' +
    Q +
    ' {' +
    Q +
    'path' +
    Q +
    ':' +
    Q +
    'a.ts' +
    Q +
    '}>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res) ? res[0] : res
  assert.ok(call)
  assert.equal(call.args['path'], 'a.ts')
})
