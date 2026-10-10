import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSubagentRunner, capReport } from '../src/subagent.ts'
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
  let nestedOpts: {
    freshChat?: boolean
    sendSystemPrompt?: boolean
    selfImprovement?: boolean
    onSubagent?: unknown
    onThinking?: unknown
    onNotice?: unknown
  } = {}
  // The parent already has UI hooks installed on the browser; the runner must
  // forward them into the nested loop so the spinner keeps animating during a
  // (long) subagent run instead of going blank.
  const parentSpin = () => {}
  const parentNotice = () => {}
  browser.onSendStart = parentSpin
  browser.onNotice = parentNotice
  const runner = createSubagentRunner({
    browser,
    workdir: '/tmp/x',
    locale: 'ru',
    runAgentLoop: (async (o: {
      task: string
      freshChat?: boolean
      sendSystemPrompt?: boolean
      selfImprovement?: boolean
      onSubagent?: unknown
      onThinking?: unknown
      onNotice?: unknown
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
  // A subagent must never spawn its own subagents or touch BACKLOG.md, even
  // when the runner is created in the operator's dev mode.
  assert.equal(nestedOpts.onSubagent, null, 'no recursion into subagents')
  assert.equal(nestedOpts.selfImprovement, false, 'no BACKLOG edits')
  // Parent UI hooks are forwarded, not dropped.
  assert.equal(nestedOpts.onThinking, parentSpin, 'spinner hook forwarded')
  assert.equal(nestedOpts.onNotice, parentNotice, 'notice hook forwarded')
  // …and the parent's hooks are restored afterwards.
  assert.equal(browser.onSendStart, parentSpin)
  assert.equal(browser.onNotice, parentNotice)
})

test('capReport truncates a runaway report with a marker', () => {
  const short = 'hello'
  assert.equal(capReport(short, 100), short)
  const long = 'x'.repeat(250)
  const capped = capReport(long, 100)
  assert.ok(capped.length < long.length)
  assert.ok(capped.startsWith('x'.repeat(100)))
  assert.ok(capped.includes('report truncated'))
  assert.ok(capped.includes('150 chars omitted'))
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

// If the parent chat id cannot be resolved the runner must NOT run the nested
// loop: without an id the finally block would skip the restore and the parent
// would continue INSIDE the subagent chat (context isolation lost).
test('runner не запускает субагента, если id родительского чата неизвестен', async () => {
  const { browser, calls } = fakeBrowser()
  browser.getCurrentChatId = async () => null
  let nestedRan = false
  const runner = createSubagentRunner({
    browser,
    workdir: '/tmp/x',
    locale: 'ru',
    runAgentLoop: (async () => {
      nestedRan = true
      return 'report'
    }) as never,
    buildTools: () => [],
    maxSubagents: 3,
    askDeadlineMs: 1000,
    maxAfterToolRetries: 1,
  })

  const res = await runner({ prompt: 'p', description: '', type: 'explore' })
  assert.equal(res.ok, false)
  assert.equal(nestedRan, false, 'nested loop must not run')
  assert.ok(/chat id is unknown/i.test(res.text), res.text)
  assert.ok(!calls.includes('newChat'), 'no fresh chat opened')
})
