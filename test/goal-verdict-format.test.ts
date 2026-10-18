import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalVerdict } from '../src/goal.ts'

// The evaluator is a MODEL: it may wrap its reply in a markdown fence
// (```…```), prefix the labels with list markers, or put BOTH labels on ONE
// line. The parser only looked for `VERDICT:` / `REASON:` with the labels at
// a word boundary of a LINE; a fenced or single-line reply returned null, and
// null means "continue" (fail closed) — so the goal loop auto-continued until
// the turn budget even when the judge had said MET.

test('parseGoalVerdict: plain reply', () => {
  const v = parseGoalVerdict('VERDICT: MET\nREASON: tests pass')
  assert.deepEqual(v, { status: 'met', reason: 'tests pass' })
})

test('parseGoalVerdict: a fenced reply is parsed', () => {
  const v = parseGoalVerdict('```\nVERDICT: MET\nREASON: done\n```')
  assert.equal(v?.status, 'met')
  assert.equal(v?.reason, 'done')
})

test('parseGoalVerdict: a list-marker reply is parsed', () => {
  const v = parseGoalVerdict('- VERDICT: NOT_MET\n- REASON: still broken')
  assert.equal(v?.status, 'not_met')
  assert.equal(v?.reason, 'still broken')
})

test('parseGoalVerdict: both labels on one line are parsed', () => {
  const v = parseGoalVerdict('VERDICT: IMPOSSIBLE REASON: cannot be done')
  assert.equal(v?.status, 'impossible')
  assert.equal(v?.reason, 'cannot be done')
})
