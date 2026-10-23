import test from 'node:test'
import assert from 'node:assert/strict'
import { parseXmlToolCalls } from '../src/xml-toolcall.ts'

const Q = String.fromCharCode(34)

// `readAttr` builds `name[ ]*=[ ]*("...")` with NO boundary before the name,
// so looking up `name` matches the TAIL of another attribute — `tool_name`,
// `param_name`, `file_name`. An invoke tag that restates the tool as
// `tool_name="Bash"` before the real `name="Write"` was dispatched to a
// NONEXISTENT tool `Bash` (the real name was ignored) and the stray
// `tool_name` leaked into the arguments.
test('an attribute that ENDS with the name does not shadow it', () => {
  const xml =
    '<invoke tool_name=' +
    Q +
    'Bash' +
    Q +
    ' name=' +
    Q +
    'Write' +
    Q +
    '><parameter name=' +
    Q +
    'path' +
    Q +
    '>a.ts</parameter></invoke>'
  const call = parseXmlToolCalls(xml)
  const one = Array.isArray(call) ? call[0] : call
  assert.ok(one, 'the call was not recognized')
  assert.equal(one!.tool, 'Write', 'the real name attribute must win')
  assert.equal((one!.args as Record<string, unknown>).path, 'a.ts')
})

// The normal shape is unchanged.
test('a plain invoke still parses', () => {
  const xml =
    '<invoke name=' +
    Q +
    'Read' +
    Q +
    '><parameter name=' +
    Q +
    'path' +
    Q +
    '>a.ts</parameter></invoke>'
  const call = parseXmlToolCalls(xml)
  const one = Array.isArray(call) ? call[0] : call
  assert.equal(one!.tool, 'Read')
})
