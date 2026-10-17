// The "looks like a tool call" guard exists to catch an UNRECOGNIZED call
// (a broken head, a truncated JSON, XML/DSML). It must not fire on ordinary
// FINAL PROSE: when it does, the loop rejects a perfectly good report and
// re-asks the model — burning turns and, after the retry budget, ending the
// task with an error instead of the answer.
//
// The bare-word alternative `\bparameter\b` / `\binvoke\b` matched any
// sentence that merely USES those words.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { responseLooksLikeToolCall } from '../src/answer-parse.ts'

test('prose mentioning the word parameter is not a call', () => {
  assert.equal(
    responseLooksLikeToolCall(
      'I added a timeout parameter: the default is 30s.',
    ),
    false,
  )
  assert.equal(
    responseLooksLikeToolCall('The new API takes a parameter: the file path.'),
    false,
  )
})

test('prose mentioning invoke/parameter as words is not a call', () => {
  assert.equal(
    responseLooksLikeToolCall('The invoke helper is exported from utils.'),
    false,
  )
  assert.equal(
    responseLooksLikeToolCall('Set the parameter in the config file.'),
    false,
  )
})

test('a real DSML/invoke tag is still a call', () => {
  assert.equal(
    responseLooksLikeToolCall('<invoke name="Read"><parameter name="path">'),
    true,
  )
  assert.equal(
    responseLooksLikeToolCall('<｜｜DSML｜｜invoke name="Read">'),
    true,
  )
  assert.equal(responseLooksLikeToolCall('DSML|invoke name="Read"'), true)
})
