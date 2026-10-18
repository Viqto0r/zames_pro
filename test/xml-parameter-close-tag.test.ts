import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseXmlToolCalls } from '../src/xml-toolcall.ts'
import { parseToolCall } from '../src/answer-parse.ts'

// The parameter VALUE is arbitrary text the model produces — a Write/Edit
// content may legitimately CONTAIN the literal text `</parameter>` (e.g. the
// model writing the XML parser source, or a docs example). The regex
// `([\s\S]*?)<\/…parameter…>` stops at the FIRST close tag, so such a value is
// CUT at that point and the rest of the content is silently lost — the file is
// written TRUNCATED. The close tag must be the one that actually ends the
// parameter, i.e. a non-greedy scan alone cannot decide; the parser must
// prefer the LAST close tag of the same name before the invoke closes.

const Q = String.fromCharCode(34)
const E = '<'

function invoke(name: string, params: Array<[string, string]>): string {
  return (
    E +
    'invoke name=' +
    Q +
    name +
    Q +
    '>' +
    params
      .map(
        ([k, v]) =>
          E + 'parameter name=' + Q + k + Q + '>' + v + E + '/parameter>',
      )
      .join('') +
    E +
    '/invoke>'
  )
}

test('a parameter value containing </parameter> is not truncated', () => {
  const content = 'const re = /<' + '/parameter>/'
  const res = parseXmlToolCalls(
    invoke('Write', [
      ['path', 'a.ts'],
      ['content', content],
    ]),
  )
  const call = Array.isArray(res) ? res[0] : res
  assert.ok(call)
  assert.equal(call.args['path'], 'a.ts')
  assert.equal(call.args['content'], content)
})

test('the same truncation through parseToolCall', () => {
  const content = 'const re = /<' + '/parameter>/'
  const res = parseToolCall(
    invoke('Write', [
      ['path', 'a.ts'],
      ['content', content],
    ]),
  )
  const call = Array.isArray(res) ? res[0] : res
  assert.ok(call)
  assert.equal(call.args['content'], content)
})

test('a normal multi-parameter call is unaffected', () => {
  const res = parseXmlToolCalls(
    invoke('Edit', [
      ['path', 'a.ts'],
      ['old_string', 'foo'],
      ['new_string', 'bar'],
    ]),
  )
  const call = Array.isArray(res) ? res[0] : res
  assert.ok(call)
  assert.equal(call.args['old_string'], 'foo')
  assert.equal(call.args['new_string'], 'bar')
})
