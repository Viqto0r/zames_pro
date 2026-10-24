// parseGoalVerdict() reads the evaluator's verdict. The evaluator is a NORMAL
// agent turn in the same chat, so its answer can be a TOOL CALL instead of the
// two requested lines — and that call's ARGUMENTS can contain the word
// `VERDICT: MET` (a Bash command echoing a test summary, a Write whose content
// mentions it, a grep). The parser scanned the RAW text and accepted that as
// the verdict; MET CLEARS the goal, so an unfinished task was silently
// accepted as done.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGoalVerdict } from '../src/goal.ts'

test('a tool-call answer is not taken for a MET verdict', () => {
  const cases = [
    '{"tool":"Bash","args":{"command":"grep VERDICT: MET notes.txt"}}',
    '<invoke name="Bash"><parameter name="command">echo "VERDICT: MET"</parameter></invoke>',
  ]
  for (const raw of cases) {
    const v = parseGoalVerdict(raw)
    assert.notEqual(v?.status, 'met', raw + ' -> ' + JSON.stringify(v))
  }
})

test('a plain verdict still parses', () => {
  assert.equal(parseGoalVerdict('VERDICT: MET\nREASON: ok')?.status, 'met')
  assert.equal(
    parseGoalVerdict('VERDICT: NOT_MET\nREASON: more work')?.status,
    'not_met',
  )
})
