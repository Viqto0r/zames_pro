import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalCommand } from '../src/commands.ts'

// `/goal on` is the natural way to RE-ENABLE an existing goal after
// `/goal clear`, but the parser treats any word except `clear`/`off` as a new
// goal TEXT — so `/goal on` silently REPLACED the operator's goal with the
// literal word "on". The evaluator then judged every turn against `on`, which
// no work can satisfy.
test('/goal on does not replace the goal with the word "on"', () => {
  const r = parseGoalCommand('/goal on')
  assert.notEqual(r && 'goal' in r ? r.goal : null, 'on')
})

test('/goal off still clears', () => {
  assert.deepEqual(parseGoalCommand('/goal off'), { sub: 'clear' })
})

test('/goal <text> still sets a goal', () => {
  assert.deepEqual(parseGoalCommand('/goal ship the fix'), {
    sub: 'set',
    goal: 'ship the fix',
  })
})
