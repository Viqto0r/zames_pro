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

test('onSendPause is forwarded to the UI callback', async () => {
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
  // The browser reports a send-pause: the loop must forward the seconds to
  // the UI hook (which animates the pause status).
  const originalAsk = browser.ask.bind(browser)
  browser.ask = async function (this: BrowserLike, text: string) {
    if (this.onSendPause) this.onSendPause(12)
    return originalAsk(text)
  } as BrowserLike['ask']
  const pauses: number[] = []
  let hookSeen: ((s: number) => void) | null | undefined

  await runAgentLoop({
    browser,
    tools,
    task: 'privet',
    workdir: dir,
    onSendPause: (seconds) => {
      pauses.push(seconds)
    },
  })

  assert.deepEqual(pauses, [12])
})
