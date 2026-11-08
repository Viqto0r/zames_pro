import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAnswer,
  extractFromJson,
  extractTokenUsage,
} from '../src/net-capture.ts'

// extractAnswer()/pickAnswerText() walk the WHOLE family of provider payloads.
// The finish-loop tests cover the FINISHED status matrix; these cases pin the
// TEXT SOURCES — which key wins and that the reasoning is never mistaken for
// the answer (a mixed-up source shows the operator the THINK phase as a reply).

const NL = String.fromCharCode(10)

test('a plain JSON answer comes from content, text or answer', () => {
  assert.equal(extractFromJson('{"content":"a"}'), 'a')
  assert.equal(extractFromJson('{"text":"b"}'), 'b')
  assert.equal(extractFromJson('{"answer":"c"}'), 'c')
})

test('choices and messages win over a bare content', () => {
  assert.equal(
    extractFromJson('{"content":"x","choices":[{"message":{"content":"y"}}]}'),
    'y',
  )
  assert.equal(
    extractFromJson('{"messages":[{"content":"m1"},{"content":"m2"}]}'),
    'm1m2',
  )
})

test('reasoning_content is NEVER taken as the answer', () => {
  assert.equal(
    extractFromJson(
      '{"choices":[{"message":{"reasoning_content":"thinking","content":""}}]}',
    ),
    '',
  )
})

test('the DeepSeek fragments shape takes only RESPONSE parts', () => {
  const body = JSON.stringify({
    response: {
      fragments: [
        { type: 'THINK', content: 'reason' },
        { type: 'RESPONSE', content: 'ans' },
        { type: 'RESPONSE', content: 'wer' },
      ],
    },
  })
  assert.equal(extractFromJson(body), 'answer')
})

test('a response OBJECT is not read as a string answer', () => {
  assert.equal(
    extractFromJson(
      '{"response":{"fragments":[{"type":"RESPONSE","content":"ok"}]}}',
    ),
    'ok',
  )
  assert.equal(extractFromJson('{"response":{}}'), '')
})

test('a nested delta/message/data payload is unwrapped', () => {
  assert.equal(
    extractFromJson('{"delta":{"content":"from delta"}}'),
    'from delta',
  )
  assert.equal(extractFromJson('{"v":{"text":"from v"}}'), 'from v')
})

test('broken JSON and an empty body yield no answer', () => {
  assert.equal(extractFromJson('{not json'), '')
  assert.equal(extractAnswer(''), '')
})

test('an SSE body is read through the data lines', () => {
  const body =
    'data: {"p":"response/fragments/-1/content","v":"hel"}' +
    NL +
    'data: {"v":"lo"}' +
    NL
  assert.equal(extractAnswer(body), 'hello')
})

test('the answer starts only when the NEW fragment is a RESPONSE', () => {
  const body =
    'data: ' +
    JSON.stringify({ p: 'response/fragments', v: [{ type: 'THINK' }] }) +
    NL +
    'data: ' +
    JSON.stringify({ p: 'response/fragments/-1/content', v: 'reason' }) +
    NL +
    'data: ' +
    JSON.stringify({
      p: 'response/fragments',
      v: [{ type: 'THINK' }, { type: 'RESPONSE' }],
    }) +
    NL +
    'data: ' +
    JSON.stringify({ p: 'response/fragments/-1/content', v: 'answer' }) +
    NL
  assert.equal(extractAnswer(body), 'answer')
})

test('the token usage comes from accumulated_token_usage in a plain body', () => {
  assert.equal(
    extractTokenUsage(
      '{"messages":[{"accumulated_token_usage":10},{"accumulated_token_usage":42}]}',
    ),
    42,
  )
  assert.equal(extractTokenUsage('{"messages":[]}'), null)
})

test('a body with neither usage field has no token count', () => {
  assert.equal(extractTokenUsage(''), null)
  assert.equal(extractTokenUsage('{"x":1}'), null)
})
