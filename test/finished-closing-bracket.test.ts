import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFinishedWithoutAnswer,
  isFinishedWithAnswer,
  isFinishedAwaitingAnswer,
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

// A snapshot whose content is only a truncated head is NOT a dead turn when
// the stream keeps APPENDING the answer: DeepSeek starts a DSML/XML call with
// a bare `{` and then appends the call in chunks. The old detector saw the
// snapshot alone, declared "finished without answer" and the finish loop
// clicked Continue / threw on a perfectly healthy turn.
function snapshotStream(appended: string[]): string {
  const lines = [
    'data: {"v":{"response":{"status":"WIP","fragments":' +
      '[{"id":2,"type":"RESPONSE","content":"\\n\\n"}]}}}',
  ]
  for (const piece of appended) {
    lines.push(
      'data: ' +
        JSON.stringify({
          p: 'response/fragments/-1/content',
          o: 'APPEND',
          v: piece,
        }),
    )
  }
  lines.push(
    'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
  )
  return lines.join(String.fromCharCode(10))
}

test('a head-only snapshot with no appended text is still awaiting the answer', () => {
  const b = snapshotStream([])
  assert.equal(isFinishedWithoutAnswer(b), true)
  assert.equal(isFinishedAwaitingAnswer(b), true)
})

// MEASURED live: DeepSeek streams a DSML/XML call as a short RESPONSE whose
// first bytes are a bare "<", so the old fragment regex read it as a 1-char
// "answer": a COMPLETE turn was never recognised as finished (the loop waited
// and re-sent it) and it counted as "still awaiting" forever.
function liveDsmlBody(): string {
  const NL = String.fromCharCode(10)
  const head =
    'data: {"v":{"response":{"status":"WIP","fragments":' +
    '[{"id":2,"type":"RESPONSE","content":"\\n\\n<"}]}}}'
  const append = (v: string): string =>
    'data: ' +
    JSON.stringify({ p: 'response/fragments/-1/content', o: 'APPEND', v })
  return [
    head,
    append('|DSML| calls>'),
    append(NL + '<|DSML| invoke name="Bash">'),
    append('<|DSML| parameter name="command">ls'),
    'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
    'data: {"p":"response/status","o":"SET","v":"FINISHED"}',
  ].join(NL)
}

test('a COMPLETE DSML call is a finished answer, not a snapshot', () => {
  const b = liveDsmlBody()
  assert.equal(isFinishedWithAnswer(b), true)
  assert.equal(isFinishedAwaitingAnswer(b), false)
})

test('a finished turn with only a bare head is still awaiting', () => {
  const NL = String.fromCharCode(10)
  const b =
    'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}' +
    NL +
    'data: {"v":{"response":{"fragments":[{"id":2,"type":"RESPONSE","content":"{"}]}}}'
  assert.equal(isFinishedWithAnswer(b), false)
  assert.equal(isFinishedAwaitingAnswer(b), true)
})
