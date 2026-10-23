import test from 'node:test'
import assert from 'node:assert/strict'
import { SERVER_BUSY_RE } from '../src/deepseek-ui.ts'

// `SERVER_BUSY_RE` runs against the RAW text of visible DeepSeek toasts
// (`readPageToastsInDom`) and against the captured SSE body. Its `502|503|504`
// alternatives had NO boundary, so they matched any occurrence of those digits
// — inside a FILE NAME, an id, a token count. A busy classification then
// replaced the real reason for a send that was perfectly fine (the agent
// backed off and re-sent).
const NOT_BUSY = [
  'Uploaded report_503_final.pdf',
  'Chat moved to folder 5027',
  'Incorrect code 50411',
  'Saved 15031 tokens',
]

for (const text of NOT_BUSY) {
  test(`a bare number is not a server-busy notice: ${text}`, () => {
    assert.equal(SERVER_BUSY_RE.test(text), false)
  })
}

// The real status codes still classify as a hiccup.
test('a real 503 status is still server-busy', () => {
  assert.equal(SERVER_BUSY_RE.test('HTTP 503 Service Unavailable'), true)
  assert.equal(SERVER_BUSY_RE.test('Status: 502'), true)
  assert.equal(SERVER_BUSY_RE.test('504'), true)
})

// And the wording still works.
test('the wording still matches', () => {
  assert.equal(SERVER_BUSY_RE.test('Server busy. Try again later.'), true)
  assert.equal(SERVER_BUSY_RE.test('Сервер занят'), true)
})
