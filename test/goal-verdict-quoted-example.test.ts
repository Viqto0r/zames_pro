import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalVerdict } from '../src/goal.ts'

// The evaluator is told to reply with EXACTLY two lines. When it instead
// EXPLAINS first (`A verdict such as "VERDICT: MET" would be wrong here`) and
// gives the real verdict on the next line, the parser took the FIRST `VERDICT:`
// occurrence — the QUOTED EXAMPLE — and cleared an unfinished goal as done.
const NL = String.fromCharCode(10)

test('a quoted example does not win over the real verdict', () => {
  const answer =
    'A verdict such as "VERDICT: MET" would be wrong here.' +
    NL +
    'VERDICT: NOT_MET' +
    NL +
    'REASON: the tests fail'
  const v = parseGoalVerdict(answer)
  assert.ok(v, 'no verdict')
  assert.equal(v.status, 'not_met', JSON.stringify(v))
})

test('a plain verdict still parses', () => {
  const v = parseGoalVerdict('VERDICT: MET' + NL + 'REASON: done')
  assert.deepEqual(v, { status: 'met', reason: 'done' })
})

test('a backtick-fenced label echo is skipped', () => {
  const answer =
    'The label is `VERDICT: MET` in the format.' +
    NL +
    'VERDICT: IMPOSSIBLE' +
    NL +
    'REASON: cannot be done'
  assert.equal(parseGoalVerdict(answer)?.status, 'impossible')
})
