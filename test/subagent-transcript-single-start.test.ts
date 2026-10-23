import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentRunner, type SubagentBrowser } from '../src/subagent.ts'

// The `Task` call is logged TWICE: agent-loop writes `subagent_start` for the
// seam before it calls onSubagent, and createSubagentRunner wrote it again for
// the SAME run. Every subagent turn therefore appeared twice in the
// transcript, and /export (which renders the raw events) showed a doubled
// "subagent started" entry per delegation. The seam owns the event — the
// runner must not duplicate it.
test('a subagent run logs subagent_start exactly once', async () => {
  const events: string[] = []
  const browser = {
    getCurrentChatId: async () => 'chat-1',
    newChat: async () => {},
    openChat: async () => true,
    onSendStart: null,
    onSendPause: null,
    onSendState: null,
    onNotice: null,
  } as unknown as SubagentBrowser
  const run = createSubagentRunner({
    browser,
    workdir: '/w',
    locale: 'en',
    runAgentLoop: (async () => 'report') as never,
    buildTools: () => [],
    transcript: { log: (event) => events.push(event) },
    maxSubagents: 5,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })
  await run({ type: 'explore', prompt: 'do it', description: 'label' })
  assert.deepEqual(
    events.filter((e) => e === 'subagent_start'),
    [],
    'the runner duplicates the event the agent loop already logs',
  )
  assert.deepEqual(events, [])
})

// The description still has to reach the TRANSCRIPT — that is what
// test/subagent-description.test.ts guards. Here we pin that the seam is the
// one carrying it: the runner must NOT be the source, so the nested loop's
// log is the only place with the label.
test('the description is carried by the loop seam, not by the runner', async () => {
  const logged: Array<{ event: string; data?: Record<string, unknown> }> = []
  const browser = {
    getCurrentChatId: async () => 'chat-1',
    newChat: async () => {},
    openChat: async () => true,
    onSendStart: null,
    onSendPause: null,
    onSendState: null,
    onNotice: null,
  } as unknown as SubagentBrowser
  const run = createSubagentRunner({
    browser,
    workdir: '/w',
    locale: 'en',
    runAgentLoop: (async () => 'report') as never,
    buildTools: () => [],
    transcript: { log: (event, data) => logged.push({ event, data }) },
    maxSubagents: 5,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })
  await run({ type: 'explore', prompt: 'do it', description: 'map auth' })
  assert.equal(
    logged.filter((e) => e.event === 'subagent_start').length,
    0,
    'runner must not log subagent_start: the loop seam already does',
  )
})
