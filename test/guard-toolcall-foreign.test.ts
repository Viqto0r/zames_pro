import { test } from 'node:test'
import assert from 'node:assert/strict'
import { responseLooksLikeToolCall } from '../src/answer-parse.ts'

const Q = String.fromCharCode(34)
const FOREIGN = [
  '{' +
    Q +
    'function_call' +
    Q +
    ': {' +
    Q +
    'name' +
    Q +
    ': ' +
    Q +
    'Bash' +
    Q +
    '}}',
  '{' + Q + 'tool_calls' + Q + ':[]}',
  '{' +
    Q +
    'name' +
    Q +
    ': ' +
    Q +
    'Bash' +
    Q +
    ', ' +
    Q +
    'arguments' +
    Q +
    ': ' +
    Q +
    'x' +
    Q +
    '}',
  '<tool_use><name>Bash</name></tool_use>',
  '<antml:invoke name=' + Q + 'Bash' + Q + '>',
]

test('a foreign call shape is recognized as a call', () => {
  for (const raw of FOREIGN) {
    assert.equal(responseLooksLikeToolCall(raw), true, raw)
  }
})

test('ordinary prose is still not a call', () => {
  assert.equal(responseLooksLikeToolCall('The task is done.'), false)
  assert.equal(
    responseLooksLikeToolCall('The arguments parameter is empty.'),
    false,
  )
})
