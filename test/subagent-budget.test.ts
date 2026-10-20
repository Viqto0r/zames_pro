import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentRunner, type SubagentBrowser } from '../src/subagent.ts'

// The per-task subagent budget must count only runs that ACTUALLY started.
// The runner incremented `used` BEFORE it could tell whether the run was
// possible, and it returns early (without running anything) when the parent
// chat id cannot be resolved. Those failed attempts burned the budget, so an
// operator with maxSubagents=1 whose first Task fired during the "id not known
// yet" window lost every later Task in that task with "budget exhausted" —
// although NOT A SINGLE subagent had run.
function fakeBrowser(chatId: string | null): SubagentBrowser {
  return {
    newChat: async () => {},
    openChat: async () => true,
    getCurrentChatId: async () => chatId,
    onSendStart: null,
    onSendPause: null,
    onSendState: null,
    onNotice: null,
  } as unknown as SubagentBrowser
}

test('a subagent that never started does not consume the budget', async () => {
  let ran = 0
  const runner = createSubagentRunner({
    browser: fakeBrowser(null), // the parent chat id is unknown -> early exit
    workdir: process.cwd(),
    locale: 'en',
    runAgentLoop: (async () => {
      ran++
      return 'report'
    }) as never,
    buildTools: () => [],
    maxSubagents: 1,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })

  const first = await runner({ type: 'explore', description: 'd', prompt: 'x' })
  assert.equal(first.ok, false)
  assert.match(first.text, /chat id is unknown/)
  assert.equal(ran, 0, 'the nested loop must not have run')

  // A second attempt must still be ALLOWED to try (same early exit, not the
  // budget message).
  const second = await runner({
    type: 'explore',
    description: 'd',
    prompt: 'y',
  })
  assert.match(
    second.text,
    /chat id is unknown/,
    'the budget was consumed by a run that never started: ' + second.text,
  )
})
