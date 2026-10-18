// The completion-goal evaluator parses a model reply. run-task treats an
// unparsable reply as "continue" (fail CLOSED), which is correct — but the
// parser must still recognise the verdict when the model formats it the way
// markdown models actually do: with the label in bold and the value in code
// or bold. It returned null for `**VERDICT:** MET`, so EVERY evaluation of a
// goal whose model bolds its headings was unparsable: the loop kept
// auto-continuing until the turn budget, even when the work was done.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalVerdict } from '../src/goal.ts'

const TICK = String.fromCharCode(96)
const ALT_TICK = String.fromCharCode(96)

test('parseGoalVerdict reads a bold label', () => {
  assert.equal(parseGoalVerdict('**VERDICT:** MET')?.status, 'met')
  assert.equal(
    parseGoalVerdict('**VERDICT:** IMPOSSIBLE')?.status,
    'impossible',
  )
})

test('parseGoalVerdict reads a bold/code value', () => {
  assert.equal(parseGoalVerdict('VERDICT: **MET**')?.status, 'met')
  assert.equal(
    parseGoalVerdict('VERDICT: ' + TICK + 'NOT_MET' + TICK)?.status,
    'not_met',
  )
})

test('parseGoalVerdict tolerates spaces around the colon', () => {
  assert.equal(parseGoalVerdict('VERDICT : MET')?.status, 'met')
})

test('parseGoalVerdict still fails closed on no verdict', () => {
  assert.equal(parseGoalVerdict('looks done to me'), null)
})

// The evaluator is told to answer `NOT_MET`, but a model often writes it the
// human way: `NOT MET` / `NOT-MET`. The strict regex missed those, so the
// verdict came back null, and null means "fail closed": the goal loop kept
// auto-continuing until the turn budget even though the judge said NOT_MET.
test('parseGoalVerdict accepts the spaced and hyphenated NOT MET spellings', () => {
  assert.equal(parseGoalVerdict('VERDICT: NOT MET')?.status, 'not_met')
  assert.equal(parseGoalVerdict('VERDICT: NOT-MET')?.status, 'not_met')
  assert.equal(
    parseGoalVerdict(
      'VERDICT: NOT MET' + String.fromCharCode(10) + 'REASON: one test fails',
    )?.status,
    'not_met',
  )
})
