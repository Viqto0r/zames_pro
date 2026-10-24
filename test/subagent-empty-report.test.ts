// createSubagentRunner() returns the nested loop's final text as the report.
// A nested run can end with an EMPTY text (the model stopped without a final
// answer, or returned only whitespace). The runner then reports `ok: true`
// with `text: ''`, and the parent model receives an EMPTY tool result — it
// cannot tell "the subagent found nothing" from "the subagent produced no
// report at all", and silently continues as if the sub-task succeeded.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentRunner } from '../src/subagent.ts'

function makeRunner(finalText: string) {
  return createSubagentRunner({
    browser: {
      newChat: async () => {},
      openChat: async () => true,
      getCurrentChatId: async () => 'parent-chat',
    } as never,
    workdir: '/tmp',
    locale: 'en',
    runAgentLoop: (async () => finalText) as never,
    buildTools: (() => []) as never,
    transcript: null,
    maxSubagents: 2,
    askDeadlineMs: 300_000,
    maxAfterToolRetries: 3,
  })
}

test('an empty subagent report is not passed on as success with no text', async () => {
  const r = await makeRunner('   ')({
    description: 'd',
    prompt: 'p',
    subagent_type: 'explore',
  } as never)
  assert.equal(r.ok, true)
  assert.notEqual(r.text.trim(), '', 'empty report passed on')
})

test('a normal report is unchanged', async () => {
  const r = await makeRunner('found it in src/a.ts')({
    description: 'd',
    prompt: 'p',
    subagent_type: 'explore',
  } as never)
  assert.equal(r.ok, true)
  assert.equal(r.text, 'found it in src/a.ts')
})
