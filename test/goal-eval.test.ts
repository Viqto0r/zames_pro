import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseGoalVerdict,
  buildEvaluatorPrompt,
  buildContinuationDirective,
  clampGoalCondition,
  GOAL_CONDITION_CAP,
  GOAL_MAX_TURNS,
} from '../src/goal.ts'

test('parseGoalVerdict: MET / NOT_MET / IMPOSSIBLE', () => {
  assert.deepEqual(parseGoalVerdict('VERDICT: MET\nREASON: tests pass'), {
    status: 'met',
    reason: 'tests pass',
  })
  assert.deepEqual(
    parseGoalVerdict('VERDICT: NOT_MET\nREASON: one test fails'),
    {
      status: 'not_met',
      reason: 'one test fails',
    },
  )
  assert.deepEqual(parseGoalVerdict('VERDICT: IMPOSSIBLE\nDEASON: x'), {
    status: 'impossible',
    reason: '',
  })
})

test('parseGoalVerdict: tolerates markdown and casing', () => {
  assert.equal(
    parseGoalVerdict('```VErdict: MET```\n@A@S**REASON:** done')?.status,
    'met',
  )
  assert.equal(parseGoalVerdict('verdict: not_met')?.status, 'not_met')
  // A missing verdict must be null (fail closed).
  assert.equal(parseGoalVerdict('I think it is probably done.'), null)
  assert.equal(parseGoalVerdict(''), null)
})

test('buildEvaluatorPrompt: includes the condition and the verdict format', () => {
  const p = buildEvaluatorPrompt('all tests pass')
  assert.ok(p.includes('all tests pass'))
  assert.ok(p.includes('VERDICT'))
  assert.ok(p.includes('MET'))
  assert.ok(p.includes('NOT_MET'))
  assert.ok(p.includes('IMPOSSIBLE'))
})

test('constants: a reasonable cap and a budget', () => {
  assert.ok(GOAL_CONDITION_CAP >= 1000)
  assert.ok(GOAL_MAX_TURNS >= 1)
})

test('clampGoalCondition: trims and caps', () => {
  assert.equal(clampGoalCondition('  x  '), 'x')
  const long = 'a'.repeat(GOAL_CONDITION_CAP + 500)
  assert.equal(clampGoalCondition(long).length, GOAL_CONDITION_CAP)
  // An emoji straddling the cap must not leave a lone high surrogate.
  const emoji = String.fromCharCode(0xd83d, 0xde00)
  const straddle = 'a'.repeat(GOAL_CONDITION_CAP - 1) + emoji + 'tail'
  const clamped = clampGoalCondition(straddle)
  for (let i = 0; i < clamped.length; i++) {
    const c = clamped.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = clamped.charCodeAt(i + 1)
      assert.ok(
        n >= 0xdc00 && n <= 0xdfff,
        'clampGoalCondition left a lone high surrogate',
      )
    }
  }
})

test('buildContinuationDirective: includes the reason when present', () => {
  const d = buildContinuationDirective('two tests fail')
  assert.ok(d.includes('NOT yet met'))
  assert.ok(d.includes('two tests fail'))
  // Empty reason is fine.
  assert.ok(!buildContinuationDirective('').includes('Evaluator note'))
})
