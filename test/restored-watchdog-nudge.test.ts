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

// The OTHER loop nudges leaked into /chats the same way: a flaky run showed
// them as the operator's own messages ("❯ Вы: Your previous answer was not
// recognized as a tool call…"). Every one of them is written by the loop, so
// every one must be dropped.
test('every agent-loop self-nudge is dropped from the restored dialogue', () => {
  const nudges = [
    'Your previous answer was not recognized as a tool call. Do NOT reply with prose',
    'You wrote plain text without a tool call. Plain text is a PROTOCOL VIOLATION',
    'You stopped after a tool call and wrote plain text. Plain text is a PROTOCOL VIOLATION',
    'You stopped mid-task without finishing. If the task is DONE',
    'Last step: call the respond tool with the final message to the operator.',
    'You have called the SAME tool with the SAME arguments several times in a row.',
    'It looks like you meant to call a tool but did not. If the task is not finished',
    'Continue the task. If you need a tool — reply with EXACTLY one JSON tool-call object',
    'Before finishing: you wrote/edited a runnable code file in this task, but you have not run',
  ]
  for (const text of nudges) {
    assert.equal(
      normalizeRestoredMessage({ role: 'user', text }),
      null,
      text.slice(0, 50),
    )
  }
})

// The guard is anchored to the START of the message: the loop always writes
// the nudge as the whole message, while an operator may QUOTE it.
test('a message that only quotes the nudge is kept', () => {
  const text = 'Why did you say "The previous turn was cut off"?'
  const r = normalizeRestoredMessage({ role: 'user', text })
  assert.ok(r, 'a message quoting the nudge was dropped')
  assert.equal(r.text, text)
})
