import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalVerdict } from '../src/goal.ts'

// The completion evaluator is a model. It sometimes ECHOES the requested
// label set before giving the real verdict:
//
//   VERDICT: MET | NOT_MET | IMPOSSIBLE
//   REASON: The condition is not satisfied yet.
//
// The parser took the FIRST match, so the echoed `MET` was accepted as the
// verdict while the REASON said the opposite. MET ends the goal loop, so a
// completion goal was silently cleared on an unfinished task.

test('an echoed label set is not the verdict', () => {
  const v = parseGoalVerdict(
    'VERDICT: MET | NOT_MET | IMPOSSIBLE\nREASON: The condition is not satisfied yet.',
  )
  // The echo carries no REAL verdict: fail closed (null => continue) rather
  // than reading the first alternative as `met`.
  assert.equal(v, null, JSON.stringify(v))
})

test('a slash-separated echo is not the verdict either', () => {
  const v = parseGoalVerdict(
    'VERDICT: MET/NOT_MET/IMPOSSIBLE\nREASON: missing two files and a test run',
  )
  assert.equal(v, null, JSON.stringify(v))
})

test('a real verdict after the echo still wins', () => {
  const v = parseGoalVerdict(
    'VERDICT: MET | NOT_MET | IMPOSSIBLE\nVERDICT: NOT_MET\nREASON: two tests fail',
  )
  assert.equal(v?.status, 'not_met')
  assert.equal(v?.reason, 'two tests fail')
})

test('a plain real verdict is unchanged', () => {
  const v = parseGoalVerdict('VERDICT: MET\nREASON: tests pass')
  assert.deepEqual(v, { status: 'met', reason: 'tests pass' })
})
