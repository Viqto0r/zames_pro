import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

const Q = String.fromCharCode(34)

function makeBrowser(script: string[]): { browser: BrowserLike; asks: string[] } {
  let i = 0
  const asks: string[] = []
  const browser: BrowserLike = {
    async ask(text: string) {
      asks.push(text)
      const r = script[i]
      i++
      if (r === undefined) throw new Error('script exhausted')
      return r
    },
    async newChat() {},
    async getCurrentChatId() { return 'chat-xyz' },
    async stopGeneration() { return true },
    async listChats() { return [] },
    async openChat() { return true },
    async close() {},
  }
  return { browser, asks }
}

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

const echoTool: ToolDef = {
  name: 'Echo',
  description: 'echo',
  parameters: { v: 'string' },
  fn: async () => 'ok',
}

const respondTool: ToolDef = {
  name: 'respond',
  description: 'final',
  parameters: { message: 'string' },
  fn: async (a) => a.message,
}

// Watchdog: after a tool result an EMPTY answer must not finish the task —
// the agent nudges (asks again) and then proceeds.
test('watchdog: пустой ответ после инструмента не завершает задачу', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('Echo', { v: '1' }),
    '   ',
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'done')
  assert.ok(asks.length >= 3, 'ask calls: ' + asks.length)
})

// Watchdog: a repeated (stale) answer after a tool result is nudged, not taken
// as the final answer.
test('watchdog: повтор прежнего ответа после инструмента переспрашивается', async () => {
  const same = jsonCall('Echo', { v: '1' })
  const { browser, asks } = makeBrowser([
    same,
    same,
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'done')
  assert.ok(asks.length >= 3, 'ask calls: ' + asks.length)
})
