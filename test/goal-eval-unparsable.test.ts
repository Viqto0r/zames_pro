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
