import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { BrowserLike, ToolDef } from '../src/types.ts'
import { translate } from '../src/i18n.ts'

// A fresh chat has ONE job: land in the RIGHT chat. The contract pinned here
// is the resumed-id precedence — a caller marks a chat fresh only when it has
// no live id, and reopening that id MUST win over newChat(), or the operator's
// dialogue vanishes into a second chat. A provider that cannot navigate falls
// back to newChat().

const t = translate('en')

const noTools: ToolDef[] = []

function makeBrowser(over: Partial<BrowserLike> = {}): {
  browser: BrowserLike
  log: string[]
} {
  const log: string[] = []
  const browser: BrowserLike = {
    async ask(text: string) {
      log.push('ask')
      return text.includes('system') ? '' : 'respond:{"message":"done"}'
    },
    async newChat() {
      log.push('newChat')
    },
    async stopGeneration() {
      return true
    },
    async getCurrentChatId() {
      return 'chat-1'
    },
    async listChats() {
      return []
    },
    async openChat(id: string) {
      log.push('openChat:' + id)
      return true
    },
    async close() {},
    ...over,
  } as BrowserLike
  return { browser, log }
}

function loopOpts(browser: BrowserLike) {
  return {
    browser,
    task: 'do it',
    workdir: process.cwd(),
    tools: noTools,
    locale: 'en' as const,
    freshChat: true,
    sendSystemPrompt: false,
    t,
    getGitContext: async () => null,
    formatGitContext: () => '',
    loadProjectContext: async () => null,
    buildSystemPrompt: () => 'system',
    onChatReady: () => {},
  } as never
}

test('a resumed chat id is REOPENED instead of a new chat', async () => {
  const { browser, log } = makeBrowser({ resumeChatId: 'chat-9' })
  await runAgentLoop(loopOpts(browser))
  assert.deepEqual(log.slice(0, 1), ['openChat:chat-9'])
  assert.equal(log.includes('newChat'), false)
})

test('without a resume id a fresh chat is created', async () => {
  const { browser, log } = makeBrowser({ resumeChatId: null })
  await runAgentLoop(loopOpts(browser))
  assert.deepEqual(log.slice(0, 1), ['newChat'])
})

test('a FAILED reopen falls back to a new chat', async () => {
  const { browser, log } = makeBrowser({
    resumeChatId: 'chat-9',
    openChat: async (id: string) => {
      log.push('openChat:' + id)
      return false
    },
  })
  await runAgentLoop(loopOpts(browser))
  assert.deepEqual(log.slice(0, 2), ['openChat:chat-9', 'newChat'])
})

test('a provider WITHOUT openChat goes straight to a new chat', async () => {
  const { browser, log } = makeBrowser({ resumeChatId: 'chat-9' })
  delete (browser as { openChat?: unknown }).openChat
  await runAgentLoop(loopOpts(browser))
  assert.deepEqual(log.slice(0, 1), ['newChat'])
})

test('freshChat:false never touches the chat lifecycle', async () => {
  const { browser, log } = makeBrowser({ resumeChatId: 'chat-9' })
  await runAgentLoop({
    ...(loopOpts(browser) as object),
    freshChat: false,
  } as never)
  assert.equal(log.includes('newChat'), false)
  assert.equal(
    log.some((l) => l.startsWith('openChat')),
    false,
  )
})
