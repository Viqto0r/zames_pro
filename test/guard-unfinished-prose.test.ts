// looksLikeUnfinishedWork() exists to catch a model that says "Let me run the
// tests" and then goes silent (no tool call). It must NOT fire on a FINAL
// REPORT that merely explains what was done: the loop then rejects a good
// answer and re-asks the model, burning turns (and on an exhausted budget it
// ends the task with a "model stopped" warning).
//
// The intent words (`explain`, `summarize`, `update you`) report a fact, they
// do not promise a tool call.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeUnfinishedWork } from '../src/answer-parse.ts'

test('a report that explains the fix is not unfinished work', () => {
  assert.equal(
    looksLikeUnfinishedWork('Let me explain: the fix touches three files.'),
    false,
  )
  assert.equal(
    looksLikeUnfinishedWork('I will now summarize: the bug was in the parser.'),
    false,
  )
})

test('a report that summarises results is not unfinished work', () => {
  assert.equal(
    looksLikeUnfinishedWork(
      'I will update you on the results: everything passed.',
    ),
    false,
  )
})

test('a real promise of work is still caught', () => {
  assert.equal(looksLikeUnfinishedWork('Let me run the tests.'), true)
  assert.equal(looksLikeUnfinishedWork("I'll check now"), true)
  assert.equal(looksLikeUnfinishedWork('Now I will edit the README.'), true)
  assert.equal(looksLikeUnfinishedWork('Now I will update the README.'), false)
})
