import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalVerdict } from '../src/goal.ts'

// The verdict CLEARS the completion goal when it parses as `met`, so a value
// that is only the HEAD of a longer word must never match. Without a right
// word boundary `VERDICT: METS` / `VERDICT: METADATA` / `VERDICT: MET-ish`
// (a typo, or a model writing `METADATA`) parsed as MET and an unfinished task
// was accepted as done.
test('a verdict that is only the head of a word is not a verdict', () => {
  assert.equal(parseGoalVerdict('VERDICT: METS'), null)
  assert.equal(parseGoalVerdict('VERDICT: METADATA: none'), null)
  // `MET-ish` / `METS` are not one of the three tokens: the label must be
  // followed by a word boundary that is not a hyphen (a hyphen only belongs
  // INSIDE `NOT-MET`).
  assert.equal(parseGoalVerdict('VERDICT: MET-ish'), null)
  assert.equal(parseGoalVerdict('VERDICT: MET_x'), null)
})

test('a real verdict still parses', () => {
  assert.deepEqual(parseGoalVerdict('VERDICT: MET'), {
    status: 'met',
    reason: '',
  })
  assert.equal(parseGoalVerdict('VERDICT: NOT_MET')?.status, 'not_met')
  assert.equal(parseGoalVerdict('VERDICT: NOT MET')?.status, 'not_met')
  assert.equal(parseGoalVerdict('VERDICT: NOT-MET')?.status, 'not_met')
  assert.equal(parseGoalVerdict('VERDICT: IMPOSSIBLE')?.status, 'impossible')
  // Trailing punctuation / markdown is still fine.
  assert.equal(parseGoalVerdict('**VERDICT:** MET.')?.status, 'met')
})
