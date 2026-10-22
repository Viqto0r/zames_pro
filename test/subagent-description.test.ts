import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentRunner } from '../src/subagent.ts'

// `SubagentRequest` carries a SHORT LABEL (`description`) for the log/UI, and
// the model is told to fill it. The runner never passed it to the nested loop
// (nor logged it), so every subagent turn in the transcript was anonymous —
// an operator debugging a long run could not tell WHICH sub-task a chat
// belonged to.
test('the subagent description reaches the transcript', async () => {
  const events: Array<{ event: string; data?: Record<string, unknown> }> = []
  const browser: never = {
    getCurrentChatId: async () => 'chat-1',
    newChat: async () => {},
    openChat: async () => true,
    onSendStart: null,
    onSendPause: null,
    onSendState: null,
    onNotice: null,
  } as never
  const run = createSubagentRunner({
    browser,
    workdir: '/w',
    locale: 'en',
    runAgentLoop: (async () => 'report') as never,
    buildTools: () => [],
    transcript: { log: (event, data) => events.push({ event, data }) },
    maxSubagents: 5,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })
  await run({
    type: 'explore',
    prompt: 'do the thing',
    description: 'map the auth flow',
  })
  const started = events.find((e) => e.event === 'subagent_start')
  assert.ok(started, 'no subagent_start event logged')
  assert.equal(started.data?.description, 'map the auth flow')
})
