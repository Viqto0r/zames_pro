// parseGoalVerdict() must read a PLAIN evaluator reply. To tell a tool call
// from prose it looks for call markers, and one of them was the bare word
// `DSML` ANYWHERE in the text. The evaluator is a model: a prose answer that
// merely MENTIONS the parser ("the DSML invoke branch was checked") was taken
// for a tool call, `toolCallVerdictText()` returned '' for it, and the verdict
// was LOST — a real `VERDICT: MET` line right there never parsed, so the goal
// loop kept continuing until the turn budget. Only a REAL DSML marker
// (`<|DSML|` / `<｜DSML｜`) means a call.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalVerdict } from '../src/goal.ts'

test('a prose answer mentioning DSML still yields its verdict', () => {
  const v = parseGoalVerdict(
    'The DSML invoke branch was checked and it is fine.\nVERDICT: MET\nREASON: parser verified',
  )
  assert.equal(v?.status, 'met')
  assert.equal(v?.reason, 'parser verified')
})

test('a real DSML tool call is still not a verdict', () => {
  const raw =
    '<\uFF5CDSML\uFF5Cinvoke name="Bash"><\uFF5CDSML\uFF5Cparameter name="command">echo VERDICT: MET</\uFF5CDSML\uFF5Cparameter></\uFF5CDSML\uFF5Cinvoke>'
  const v = parseGoalVerdict(raw)
  assert.notEqual(v?.status, 'met')
})

test('an ASCII DSML call is still not a verdict', () => {
  const raw =
    '<|DSML|invoke name="Bash"><|DSML|parameter name="command">echo VERDICT: MET</|DSML|parameter></|DSML|invoke>'
  assert.notEqual(parseGoalVerdict(raw)?.status, 'met')
})
