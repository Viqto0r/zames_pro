import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalCommand, withGoal } from '../src/commands.ts'

const NL = String.fromCharCode(10)

test('parseGoalCommand: show / clear / set', () => {
  assert.deepEqual(parseGoalCommand('/goal'), { sub: 'show' })
  assert.deepEqual(parseGoalCommand('/goal   '), { sub: 'show' })
  assert.deepEqual(parseGoalCommand('/goal clear'), { sub: 'clear' })
  assert.deepEqual(parseGoalCommand('/goal off'), { sub: 'clear' })
  assert.deepEqual(parseGoalCommand('/goal ship v2'), {
    sub: 'set',
    goal: 'ship v2',
  })
  // Multi-word goals keep their inner text as-is.
  assert.deepEqual(parseGoalCommand('/goal  fix all tests  '), {
    sub: 'set',
    goal: 'fix all tests',
  })
})

test('parseGoalCommand: rejects non-commands', () => {
  assert.equal(parseGoalCommand('/goals'), null)
  assert.equal(parseGoalCommand('goal'), null)
  assert.equal(parseGoalCommand(''), null)
  assert.equal(parseGoalCommand('/queue'), null)
})

test('withGoal: prepends the goal, keeps the task after it', () => {
  const out = withGoal('be careful with prod', 'fix the bug')
  assert.ok(out.includes('be careful with prod'))
  assert.ok(out.includes('fix the bug'))
  assert.ok(out.indexOf('be careful') < out.indexOf('fix the bug'))
  assert.ok(out.includes(NL))
})

test('withGoal: empty/whitespace goal returns the task unchanged', () => {
  assert.equal(withGoal(null, 'do X'), 'do X')
  assert.equal(withGoal('', 'do X'), 'do X')
  assert.equal(withGoal('   ', 'do X'), 'do X')
  assert.equal(withGoal(undefined, 'do X'), 'do X')
})
