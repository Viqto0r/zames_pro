import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentRunner } from '../src/subagent.ts'
import type { BrowserLike, ToolDef } from '../src/types.ts'

// The runner opens a fresh chat, runs a NESTED loop, restores the parent chat
// and enforces the per-task budget. The nested runAgentLoop is injected so the
// test never touches a browser.

function fakeBrowser(): {
  browser: BrowserLike & {
    newChat: () => Promise<void>
    openChat: (id: string) => Promise<boolean>
  }
  calls: string[]
} {
  const calls: string[] = []
  let chat = 'chat-parent'
  const browser = {
    async ask() {
      return ''
    },
    async newChat() {
      calls.push('newChat')
      chat = 'chat-sub'
    },
    async openChat(id: string) {
      calls.push('openChat:' + id)
      chat = id
      return true
    },
    async getCurrentChatId() {
      return chat
    },
    async stopGeneration() {
      return true
    },
    async listChats() {
      return []
    },
    async close() {},
  }
  return { browser, calls }
}

test('runner изолирует контекст (freshChat+systemPrompt), возвращает отчёт и восстанавливает родительский чат', async () => {
  const { browser, calls } = fakeBrowser()
  let nestedTask = ''
  let nestedOpts: { freshChat?: boolean; sendSystemPrompt?: boolean } = {}
  const runner = createSubagentRunner({
    browser,
    workdir: '/tmp/x',
    locale: 'ru',
    runAgentLoop: (async (o: {
      task: string
      freshChat?: boolean
      sendSystemPrompt?: boolean
    }) => {
      nestedTask = o.task
      nestedOpts = o
      return 'SUB REPORT'
    }) as never,
    buildTools: (readOnly: boolean): ToolDef[] => {
      assert.equal(readOnly, true)
      return []
    },
    maxSubagents: 3,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })

  const res = await runner({
    prompt: 'explore X',
    description: 'd',
    type: 'explore',
  })

  assert.equal(res.ok, true)
  assert.equal(res.text, 'SUB REPORT')
  // The nested loop owns the chat switch: the runner must ask it for a FRESH
  // chat with the system prompt, which is what isolates the subagent context.
  assert.equal(nestedOpts.freshChat, true, 'the subagent runs in a fresh chat')
  assert.equal(nestedOpts.sendSystemPrompt, true)
  assert.ok(
    calls.includes('openChat:chat-parent'),
    'the parent chat was restored',
  )
  // The persona + the sub-task must both be in the nested task text.
  assert.ok(nestedTask.includes('SUBAGENT'))
  assert.ok(nestedTask.includes('explore X'))
})

test('runner уважает бюджет субагентов на задачу', async () => {
  const { browser } = fakeBrowser()
  let runs = 0
  const runner = createSubagentRunner({
    browser,
    workdir: '/tmp/x',
    locale: 'ru',
    runAgentLoop: (async () => {
      runs++
      return 'r'
    }) as never,
    buildTools: () => [],
    maxSubagents: 1,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })

  const a = await runner({ prompt: 'p', description: '', type: 'general' })
  const b = await runner({ prompt: 'p2', description: '', type: 'general' })

  assert.equal(a.ok, true)
  assert.equal(b.ok, false)
  assert.ok(b.text.includes('budget'))
  assert.equal(runs, 1)
})

test('runner возвращает ошибку, если вложенный цикл бросил (и всё равно восстанавливает чат)', async () => {
  const { browser, calls } = fakeBrowser()
  const runner = createSubagentRunner({
    browser,
    workdir: '/tmp/x',
    locale: 'ru',
    runAgentLoop: (async () => {
      throw new Error('boom')
    }) as never,
    buildTools: () => [],
    maxSubagents: 3,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })

  const res = await runner({ prompt: 'p', description: '', type: 'general' })
  assert.equal(res.ok, false)
  assert.ok(res.text.includes('boom'))
  assert.ok(calls.includes('openChat:chat-parent'))
})
