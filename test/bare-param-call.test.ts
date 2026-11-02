import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseXmlToolCalls } from '../src/xml-toolcall.ts'

const Q = String.fromCharCode(34)

// A live answer dropped the invoke wrapper and carried the tool name as a
// PARAMETER next to args. Before, the call was lost and the agent stalled.
test('a bare parameter list with a tool parameter is restored', () => {
  const text =
    '<|DSML|parameter name=' +
    Q +
    'tool' +
    Q +
    ' string=' +
    Q +
    'false' +
    Q +
    '>Bash</|DSML|parameter>' +
    '<|DSML|parameter name=' +
    Q +
    'args' +
    Q +
    ' string=' +
    Q +
    'false' +
    Q +
    '>{"command":"ls"}</|DSML|parameter>'
  const res = parseXmlToolCalls(text)
  assert.ok(res, 'a bare parameter call must be restored')
  const call = Array.isArray(res) ? res[0] : res
  assert.equal(call.tool, 'Bash')
  assert.equal(call.args['command'], 'ls')
})

test('a bare parameter list without a tool name is not a call', () => {
  const text =
    '<|DSML|parameter name=' +
    Q +
    'args' +
    Q +
    '>{"command":"ls"}</|DSML|parameter>'
  assert.equal(parseXmlToolCalls(text), null)
})
