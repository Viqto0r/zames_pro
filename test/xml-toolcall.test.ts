import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseXmlToolCalls } from '../src/xml-toolcall.ts'

const Q = String.fromCharCode(34)

test('не-XML текст → null', () => {
  assert.equal(parseXmlToolCalls('просто текст'), null)
  assert.equal(parseXmlToolCalls(''), null)
})

test('invoke + parameter распознаётся', () => {
  const text =
    '<invoke name=' +
    Q +
    'Read' +
    Q +
    '>' +
    '<parameter name=' +
    Q +
    'path' +
    Q +
    '>a.js</parameter>' +
    '</invoke>'
  const res = parseXmlToolCalls(text)
  assert.ok(res)
  const call = Array.isArray(res) ? res[0] : res
  assert.equal(call.tool, 'Read')
  assert.equal(call.args['path'], 'a.js')
})

test('числовой параметр без string=true парсится как число', () => {
  const text =
    '<invoke name=' +
    Q +
    'Read' +
    Q +
    '>' +
    '<parameter name=' +
    Q +
    'limit' +
    Q +
    '>5</parameter>' +
    '</invoke>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res)
    ? res[0]
    : (res as { args: Record<string, unknown> })
  assert.equal(call.args['limit'], 5)
  assert.equal(typeof call.args['limit'], 'number')
})

test('параметр string=true остаётся строкой', () => {
  const text =
    '<invoke name=' +
    Q +
    'Bash' +
    Q +
    '>' +
    '<parameter name=' +
    Q +
    'command' +
    Q +
    ' string=' +
    Q +
    'true' +
    Q +
    '>5</parameter>' +
    '</invoke>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res)
    ? res[0]
    : (res as { args: Record<string, unknown> })
  assert.equal(call.args['command'], '5')
  assert.equal(typeof call.args['command'], 'string')
})

test('единственный parameter args разворачивается в сами аргументы', () => {
  const text =
    '<invoke name=' +
    Q +
    'Read' +
    Q +
    '>' +
    '<parameter name=' +
    Q +
    'args' +
    Q +
    ' string=' +
    Q +
    'false' +
    Q +
    '>' +
    JSON.stringify({ path: 'x.js' }) +
    '</parameter></invoke>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res)
    ? res[0]
    : (res as { args: Record<string, unknown> })
  assert.equal(call.args['path'], 'x.js')
  assert.equal(call.args['args'], undefined)
})

test('гибридная форма: inline JSON args в самом теге invoke', () => {
  // Real case from the transcript.
  const text =
    '<|DSML|invoke name=' +
    Q +
    'GitAdd' +
    Q +
    ', ' +
    Q +
    'args' +
    Q +
    ' {' +
    Q +
    'paths' +
    Q +
    ': ' +
    Q +
    'AGENTS.md src/index.ts' +
    Q +
    '}>'
  const res = parseXmlToolCalls(text)
  assert.ok(res, 'гибридная форма должна распознаваться')
  const call = Array.isArray(res) ? res[0] : res
  assert.equal(call.tool, 'GitAdd')
  assert.equal(call.args['paths'], 'AGENTS.md src/index.ts')
})

test('гибридная форма с вложенными значениями', () => {
  const text = '<invoke name="Edit" args={"path":"a.ts","new_string":"x"}>'
  const res = parseXmlToolCalls(text)
  assert.ok(res)
  const call = Array.isArray(res) ? res[0] : res
  assert.equal(call.tool, 'Edit')
  assert.equal(call.args['path'], 'a.ts')
  assert.equal(call.args['new_string'], 'x')
})

// A real DeepSeek answer (E2E chess test) emitted the small argument as an
// ATTRIBUTE of the invoke tag while the big `content` came as a <parameter>
// child. Only `name` was read from the attrs, so `path` was silently dropped
// and Write failed with 'Missing required argument: path' on every retry.
test('аргумент-атрибут invoke не теряется рядом с parameter', () => {
  const text =
    '<|DSML|invoke name=' +
    Q +
    'Write' +
    Q +
    ' path=' +
    Q +
    'chess.html' +
    Q +
    '>' +
    '<|DSML|parameter name=' +
    Q +
    'content' +
    Q +
    ' string=' +
    Q +
    'true' +
    Q +
    '>X</|DSML|parameter>' +
    '</|DSML|invoke>'
  const res = parseXmlToolCalls(text)
  assert.ok(res, 'вызов должен распознаваться')
  const call = Array.isArray(res) ? res[0] : res
  assert.equal(call.tool, 'Write')
  assert.equal(call.args['path'], 'chess.html')
  assert.equal(call.args['content'], 'X')
})

test('parameter имеет приоритет над одноимённым атрибутом', () => {
  const text =
    '<invoke name=' +
    Q +
    'Write' +
    Q +
    ' path=' +
    Q +
    'attr.html' +
    Q +
    '>' +
    '<parameter name=' +
    Q +
    'path' +
    Q +
    ' string=' +
    Q +
    'true' +
    Q +
    '>param.html</parameter>' +
    '</invoke>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res)
    ? res[0]
    : (res as { args: Record<string, unknown> })
  assert.equal(call.args['path'], 'param.html')
})
