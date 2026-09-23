import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

function makeBrowser(script: string[]): BrowserLike {
  let i = 0
  return {
    async ask(text: string) {
      if (this.onSendStart) this.onSendStart()
      const r = script[i]
      i++
      if (r === undefined) throw new Error('script exhausted')
      return r
    },
    async newChat() {},
    async getCurrentChatId() {
      return 'chat-xyz'
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
  }
}

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

test('onSendStart is wired to onThinking and cleared after the loop', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-spinner'))
  const tools: ToolDef[] = [
    {
      name: 'respond',
      description: 'respond',
      parameters: { message: 'string' },
      fn: (args) => String(args['message']),
    },
  ]
  const browser = makeBrowser([jsonCall('respond', { message: 'готово' })])
  let thinkingCalls = 0

  const result = await runAgentLoop({
    browser,
    tools,
    task: 'privet',
    workdir: dir,
    onThinking: () => {
      thinkingCalls++
    },
  })

  assert.equal(result, 'готово')
  assert.ok(thinkingCalls >= 1, 'onThinking must have fired at least once')
})
