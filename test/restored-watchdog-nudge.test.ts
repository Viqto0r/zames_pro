// The agent loop's watchdog writes its OWN text into the chat as a "user"
// message when an answer times out ("The previous turn was cut off..."). It
// is protocol noise, not the operator's words, but the restored-dialogue
// filter only knew the older "You stopped after a tool result" nudge — so a
// flaky run left a dozen copies of the timeout text in /resume.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRestoredMessage } from '../src/restore-history.ts'

const TIMEOUT_NUDGE =
  'The previous turn was cut off (the answer did not arrive in time), so the work is NOT finished. ' +
  'Continue from where you stopped: reply with EXACTLY one JSON tool-call object, ' +
  'no text before or after, for example: ' +
  '{"tool": "Bash", "args": {"command": "..."}}. ' +
  'If the task is really done — call respond with the final message.'

test('the loop timeout nudge is dropped from the restored dialogue', () => {
  assert.equal(
    normalizeRestoredMessage({ role: 'user', text: TIMEOUT_NUDGE }),
    null,
  )
})

test('the tool-result watchdog nudge is still dropped', () => {
  assert.equal(
    normalizeRestoredMessage({
      role: 'user',
      text: 'You stopped after a tool result. Continue the work: reply with EXACTLY one JSON tool-call object',
    }),
    null,
  )
})

// The guard is anchored to the START of the message: the loop always writes
// the nudge as the whole message, while an operator may QUOTE it.
test('a message that only quotes the nudge is kept', () => {
  const text = 'Why did you say "The previous turn was cut off"?'
  const r = normalizeRestoredMessage({ role: 'user', text })
  assert.ok(r, 'a message quoting the nudge was dropped')
  assert.equal(r.text, text)
})
