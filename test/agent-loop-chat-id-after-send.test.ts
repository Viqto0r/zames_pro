// A new chat has NO id until the first message is sent: DeepSeek and Qwen
// only move to /c/<id> (or report one in the network capture) after the first
// turn. `reportChat()` was called right after `newChat()`, when the id is
// still null, so `onChatReady` never fired for the FIRST task in a fresh
// session and the session was not saved — `/sessions` and the startup
// auto-restore did not know about it.
// After a successful send the id IS known, so the loop must report it then.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { BrowserLike, ToolDef } from '../src/types.ts'

function makeBrowser(): {
  browser: BrowserLike
  setChat: (id: string | null) => void
} {
  let chat: string | null = null
  const browser = {
    async newChat() {
      chat = null
    },
    async ask() {
      // The first send is what creates the chat on the site.
      if (!chat) chat = 'chat-created-by-send'
      return '{"tool":"respond","args":{"message":"done"}}'
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
  } as unknown as BrowserLike
  return { browser, setChat: (id) => (chat = id) }
}

const tools: ToolDef[] = [
  {
    name: 'respond',
    description: 'final answer',
    parameters: { message: 'string' },
    fn: async () => 'ok',
  },
]

test('the chat id created by the first send is reported', async () => {
  const { browser } = makeBrowser()
  const seen: string[] = []
  await runAgentLoop({
    browser,
    tools,
    task: 'say done',
    workdir: '/tmp',
    freshChat: true,
    sendSystemPrompt: false,
    maxIterations: 3,
    onChatReady: (id: string | null) => {
      if (id) seen.push(id)
    },
  } as never)
  assert.deepEqual(seen, ['chat-created-by-send'])
})
