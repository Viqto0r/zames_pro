import { test } from 'node:test'
import assert from 'node:assert/strict'
import { performCompact } from '../src/compact.ts'
import type { BrowserLike } from '../src/types.ts'

// /compact logic extracted into a reusable performCompact() so the manual
// command and the automatic between-tools trigger share ONE implementation
// (same retries, same local fallback, same system-prompt resend).

function makeBrowser(opts: { summary: string }): {
  browser: BrowserLike
  asks: string[]
} {
  const asks: string[] = []
  let chatId = 'old-chat'
  const browser: BrowserLike = {
    async ask(text: string) {
      asks.push(text)
      // The FIRST agent-ask is the summary request.
      if (asks.length === 1) return opts.summary
      return 'ok'
    },
    async newChat() {
      chatId = 'new-chat'
    },
    async getCurrentChatId() {
      return chatId
    },
    async stopGeneration() {
      return true
    },
    async listChats() {
      return []
    },
    async openChat() {
      return true
    },
    async close() {},
    getLastTokenUsage: () => 150000,
    fetchChatMessages: async () => [],
  }
  return { browser, asks }
}

const noop = (): void => {}

test('performCompact summarizes, opens a new chat and posts carryover', async () => {
  const { browser, asks } = makeBrowser({
    summary:
      'We worked on the parser and fixed the truncation bug; next step is tests.',
  })
  const res = await performCompact({
    browser,
    currentChatId: 'old-chat',
    workdir: '/tmp',
    locale: 'ru',
    transcript: { log: noop },
    buildSystemPrompt: () => 'SYSTEM-PROMPT',
    tools: [],
    answerTimeoutMs: 60000,
  })
  assert.equal(res.ok, true)
  assert.equal(res.chatId, 'new-chat')
  assert.ok(res.summaryChars > 0)
  // summary request + system prompt + carryover
  assert.equal(asks.length, 3)
  assert.equal(asks[1], 'SYSTEM-PROMPT')
  assert.ok(asks[2].includes('compacted'))
})

test('performCompact falls back to a local history summary', async () => {
  const asks: string[] = []
  let newChats = 0
  const browser: BrowserLike = {
    async ask(text: string) {
      asks.push(text)
      // Every summary attempt returns unusable tool-call JSON.
      if (asks.length <= 3) return '{"tool": "Bash", "args": {}}'
      return 'ok'
    },
    async newChat() {
      newChats++
    },
    async getCurrentChatId() {
      return newChats ? 'new-chat' : 'old-chat'
    },
    async stopGeneration() {
      return true
    },
    async listChats() {
      return []
    },
    async openChat() {
      return true
    },
    async close() {},
    getLastTokenUsage: () => null,
    fetchChatMessages: async () => [
      { role: 'user' as const, text: 'сделай X' },
      { role: 'assistant' as const, text: 'готово' },
    ],
  }
  const res = await performCompact({
    browser,
    currentChatId: 'old-chat',
    workdir: '/tmp',
    locale: 'ru',
    transcript: { log: noop },
    buildSystemPrompt: () => 'SYS',
    tools: [],
    answerTimeoutMs: 60000,
  })
  assert.equal(res.ok, true, 'the local fallback must complete the compaction')
})

test('performCompact reports an abort without opening a new chat', async () => {
  const browser: BrowserLike = {
    async ask() {
      return '(прервано пользователем)'
    },
    async newChat() {},
    async getCurrentChatId() {
      return 'old-chat'
    },
    async stopGeneration() {
      return true
    },
    async listChats() {
      return []
    },
    async openChat() {
      return true
    },
    async close() {},
    getLastTokenUsage: () => 100,
    fetchChatMessages: async () => [],
  }
  const res = await performCompact({
    browser,
    currentChatId: 'old-chat',
    workdir: '/tmp',
    locale: 'ru',
    transcript: { log: noop },
    buildSystemPrompt: () => 'SYS',
    tools: [],
    answerTimeoutMs: 60000,
  })
  assert.equal(res.ok, false)
  assert.match(res.error || '', /прервано/)
})
