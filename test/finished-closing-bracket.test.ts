import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFinishedWithoutAnswer,
  isFinishedWithAnswer,
} from '../src/net-capture.ts'

// A truncated RESPONSE head (a lone `{` / `[`) must NOT count as an answer, or
// the finish loop waits out the whole watchdog on a turn the server already
// ended. TRUNCATED_HEAD_RE listed only the OPENING brackets, so a truncated
// answer that began with a CLOSER (a lone `}`, `]`, `)[`) was accepted as a
// COMPLETE answer and returned to the tool-call parser.
function body(content: string): string {
  return (
    'data: {"v":{"response":{"quasi_status":"FINISHED","fragments":' +
    '[{"type":"RESPONSE","content":' +
    JSON.stringify(content) +
    '}]}}}'
  )
}

for (const head of ['}', ']', ')[', '})']) {
  test(`a lone closing bracket ${JSON.stringify(head)} is not an answer`, () => {
    assert.equal(isFinishedWithAnswer(body(head)), false)
    assert.equal(isFinishedWithoutAnswer(body(head)), true)
  })
}

test('a real short answer is still an answer', () => {
  assert.equal(isFinishedWithAnswer(body('ok')), true)
  assert.equal(isFinishedWithoutAnswer(body('ok')), false)
})
