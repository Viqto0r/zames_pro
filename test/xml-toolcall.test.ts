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
    '<invoke name=' + Q + 'Read' + Q + '>' +
    '<parameter name=' + Q + 'path' + Q + '>a.js</parameter>' +
    '</invoke>'
  const res = parseXmlToolCalls(text)
  assert.ok(res)
  const call = Array.isArray(res) ? res[0] : res
  assert.equal(call.tool, 'Read')
  assert.equal(call.args['path'], 'a.js')
})

test('числовой параметр без string=true парсится как число', () => {
  const text =
    '<invoke name=' + Q + 'Read' + Q + '>' +
    '<parameter name=' + Q + 'limit' + Q + '>5</parameter>' +
    '</invoke>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res) ? res[0] : (res as { args: Record<string, unknown> })
  assert.equal(call.args['limit'], 5)
  assert.equal(typeof call.args['limit'], 'number')
})

test('параметр string=true остаётся строкой', () => {
  const text =
    '<invoke name=' + Q + 'Bash' + Q + '>' +
    '<parameter name=' + Q + 'command' + Q + ' string=' + Q + 'true' + Q + '>5</parameter>' +
    '</invoke>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res) ? res[0] : (res as { args: Record<string, unknown> })
  assert.equal(call.args['command'], '5')
  assert.equal(typeof call.args['command'], 'string')
})

test('единственный parameter args разворачивается в сами аргументы', () => {
  const text =
    '<invoke name=' + Q + 'Read' + Q + '>' +
    '<parameter name=' + Q + 'args' + Q + ' string=' + Q + 'false' + Q + '>' +
    JSON.stringify({ path: 'x.js' }) +
    '</parameter></invoke>'
  const res = parseXmlToolCalls(text)
  const call = Array.isArray(res) ? res[0] : (res as { args: Record<string, unknown> })
  assert.equal(call.args['path'], 'x.js')
  assert.equal(call.args['args'], undefined)
})
