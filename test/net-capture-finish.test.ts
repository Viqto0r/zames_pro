import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFinishedWithoutAnswer,
  isFinishedAwaitingAnswer,
  isFinishedWithAnswer,
} from '../src/net-capture.js'

// The three finish predicates are the network-authoritative "the turn is
// over" signal the finish loop trusts (see docs/DESIGN-NOTES.md, "Length
// limit reached"). They used to be untested, so the coverage floor for
// net-capture.ts sat a point below the real number and ANY new line failed
// CI. These cases pin the three states: no answer, a truncated head, a real
// answer.

const FINISHED = 'data: {"v":{"response":{"quasi_status":"FINISHED"}}}'

function body(content: string): string {
  return (
    'data: {"v":{"response":{"fragments":[{"type":"RESPONSE","content":' +
    JSON.stringify(content) +
    '}]}}}\n' +
    FINISHED
  )
}

test('a body without a FINISHED status is never "finished"', () => {
  const open = 'data: {"v":{"response":{"quasi_status":"GENERATING"}}}'
  assert.equal(isFinishedWithoutAnswer(open), false)
  assert.equal(isFinishedAwaitingAnswer(open), false)
  assert.equal(isFinishedWithAnswer(open), false)
  assert.equal(isFinishedWithoutAnswer(''), false)
  assert.equal(isFinishedAwaitingAnswer(''), false)
  assert.equal(isFinishedWithAnswer(''), false)
})

test('a FINISHED body with no response text is WITHOUT an answer', () => {
  const empty = FINISHED
  assert.equal(isFinishedWithoutAnswer(empty), true)
  assert.equal(isFinishedAwaitingAnswer(empty), true)
  assert.equal(isFinishedWithAnswer(empty), false)
})

test('a truncated head is a SNAPSHOT, not an answer', () => {
  for (const head of ['{', '<', '\n', '  ', '[(']) {
    const b = body(head)
    assert.equal(
      isFinishedWithoutAnswer(b),
      true,
      JSON.stringify(head) + ' must read as unfinished',
    )
    assert.equal(isFinishedAwaitingAnswer(b), true)
    assert.equal(isFinishedWithAnswer(b), false)
  }
})

test('a FINISHED body with real text is WITH an answer', () => {
  const b = body('zames_pro is a terminal coding agent')
  assert.equal(isFinishedWithAnswer(b), true)
  assert.equal(isFinishedWithoutAnswer(b), false)
  assert.equal(isFinishedAwaitingAnswer(b), false)
})

test('a short complete tool call counts as an answer, not a snapshot', () => {
  // A live DSML/JSON call arrives as a SHORT RESPONSE whose first byte is
  // `<`/`{`; the fragment-regex measure called it truncated and the loop
  // re-sent a healthy turn. The decoded text is the truth.
  const b = body('<|DSML|invoke name="Bash">')
  assert.equal(isFinishedWithAnswer(b), true)
  assert.equal(isFinishedAwaitingAnswer(b), false)
})
