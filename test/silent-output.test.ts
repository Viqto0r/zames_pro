import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

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
  return { browser, asks }
}

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

const echoTool: ToolDef = {
  name: 'Echo',
  description: 'echo',
  parameters: { v: 'string' },
  fn: async () => 'echo-ok',
}

const respondTool: ToolDef = {
  name: 'respond',
  description: 'respond',
  parameters: { message: 'string' },
  fn: async (a) => String(a['message']),
}

// The operator must never see pre-tool prose. It is handed to
// onAssistantThought (a no-op by default), never to onAssistantMessage.
test('промежуточный текст вокруг вызова не идёт оператору (onAssistantMessage)', async () => {
  const { browser } = makeBrowser([
    // Prose BEFORE the call, in the same answer.
    'Сейчас посмотрю файл.\n' + jsonCall('Echo', { v: '1' }),
    jsonCall('respond', { message: 'готово' }),
  ])
  const thoughts: string[] = []
  const messages: string[] = []
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    onAssistantThought: (t) => thoughts.push(t),
    onAssistantMessage: (m) => messages.push(m),
  })
  assert.equal(result, 'готово')
  // The final respond is the ONLY message the operator receives.
  assert.deepEqual(messages, ['готово'])
  // The pre-tool prose went to onAssistantThought, not to the UI.
  assert.ok(
    thoughts.some((t) => t.includes('Сейчас посмотрю')),
    'пре-текст должен уйти в onAssistantThought: ' + JSON.stringify(thoughts),
  )
})

test('onAssistantThought по умолчанию (без колбэка) не роняет цикл', async () => {
  const { browser } = makeBrowser([
    'Let me check.\n' + jsonCall('Echo', { v: '1' }),
    jsonCall('respond', { message: 'ok' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'ok')
})

test('чистый текст без вызова не уходит оператору как финал', async () => {
  // A plain text answer without a call must be re-asked, never shown as the
  // final message; only respond reaches the operator.
  const { browser } = makeBrowser([
    'Сейчас всё проверю.',
    jsonCall('respond', { message: 'итог' }),
  ])
  const messages: string[] = []
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
    onAssistantMessage: (m) => messages.push(m),
  })
  assert.equal(result, 'итог')
  assert.deepEqual(messages, ['итог'])
})

// The session looked "stopped after a tool call" with a tool_call but no
// tool_result in the log. One cause: a UI callback (rendering a huge result)
// threw right after the tool ran and killed the loop. Callbacks must never
// break the run.
test('исключение в onToolResult/onToolCall не роняет цикл', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('Echo', { v: '1' }),
    jsonCall('respond', { message: 'still-alive' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 10,
    onToolCall: () => {
      throw new Error('ui toolCall boom')
    },
    onToolResult: () => {
      throw new Error('ui toolResult boom')
    },
    onAssistantMessage: () => {
      throw new Error('ui assistant boom')
    },
  })
  assert.equal(result, 'still-alive')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

test('исключение в onWarning не роняет цикл', async () => {
  const { browser } = makeBrowser([
    '{"tool": "Bash", "args": {"command": "ls',
    '{"tool": "Bash", "args": {"command": "ls',
    '{"tool": "Bash", "args": {"command": "ls',
    jsonCall('respond', { message: 'ok' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 15,
    onWarning: () => {
      throw new Error('ui warning boom')
    },
  })
  assert.ok(result.length > 0)
})
