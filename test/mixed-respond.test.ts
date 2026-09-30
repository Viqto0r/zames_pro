import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike, ToolArgs } from '../src/types.ts'

// B7: a respond that arrives TOGETHER with real tool calls must not be dropped
// silently. The tools run first, but if the model then stops WITHOUT calling
// respond again, the remembered respond message is delivered as the final.

function makeBrowser(script: string[]): { browser: BrowserLike } {
  let i = 0
  const browser: BrowserLike = {
    async ask() {
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
  return { browser }
}

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

const echoTool: ToolDef = {
  name: 'Echo',
  description: 'echo',
  parameters: { v: 'string' },
  fn: async (_a: ToolArgs) => 'echo-ok',
}

const respondTool: ToolDef = {
  name: 'respond',
  description: 'final',
  parameters: { message: 'string' },
  fn: async (a: ToolArgs) => String(a['message']),
}

test('mixed respond+tools delivers the remembered respond if the model stops', async () => {
  const mixed = JSON.stringify([
    { tool: 'Echo', args: { v: '1' } },
    { tool: 'respond', args: { message: 'готово из смешанного' } },
  ])
  const script: string[] = [mixed]
  // After the tool, the model keeps emitting plain text (no respond).
  for (let i = 0; i < 30; i++) {
    script.push('Всё сделано, но без вызова инструмента.')
  }
  const { browser } = makeBrowser(script)
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 40,
  })
  assert.equal(result, 'готово из смешанного')
})

test('mixed respond+tools still runs the tools first', async () => {
  let ran = false
  const echo: ToolDef = {
    name: 'Echo',
    description: 'echo',
    parameters: { v: 'string' },
    fn: async () => {
      ran = true
      return 'ok'
    },
  }
  const mixed = JSON.stringify([
    { tool: 'Echo', args: { v: '1' } },
    { tool: 'respond', args: { message: 'готово' } },
  ])
  const { browser } = makeBrowser([mixed, jsonCall('respond', { message: 'done' })])
  const result = await runAgentLoop({
    browser,
    tools: [echo, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 10,
  })
  assert.equal(ran, true, 'the tool must run')
  assert.equal(result, 'done')
})
