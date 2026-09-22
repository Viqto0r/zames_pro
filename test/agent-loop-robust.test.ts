import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

function makeBrowser(script: string[]): { browser: BrowserLike; asks: string[] } {
  let i = 0
  const asks: string[] = []
  const browser: BrowserLike = {
    async ask(text: string) { asks.push(text); const r = script[i]; i++; if (r === undefined) throw new Error('script exhausted'); return r },
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

const respondTool: ToolDef = {
  name: 'respond',
  description: 'respond',
  parameters: { message: 'string' },
  fn: async (a) => String(a['message']),
}

test('пустой respond не завершает задачу, агент просит продолжить', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('respond', { message: '' }),
    jsonCall('respond', { message: 'готово' }),
  ])
  const result = await runAgentLoop({ browser, tools: [respondTool], task: 'x', workdir: process.cwd() })
  assert.equal(result, 'готово')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

test('обрезанный JSON-вызов не завершает задачу как финальный ответ', async () => {
  const { browser, asks } = makeBrowser([
    '{"tool": "Bash", "args": {"comm',
    jsonCall('respond', { message: 'ok' }),
  ])
  const result = await runAgentLoop({ browser, tools: [respondTool], task: 'x', workdir: process.cwd() })
  assert.equal(result, 'ok')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

test('обрезанный DSML-вызов не завершает задачу как финальный ответ', async () => {
  const { browser, asks } = makeBrowser([
    '<|DSML|invoke name="Bash"><|DSML|parameter name="comm',
    jsonCall('respond', { message: 'ok2' }),
  ])
  const result = await runAgentLoop({ browser, tools: [respondTool], task: 'x', workdir: process.cwd() })
  assert.equal(result, 'ok2')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

test('пустой respond исчерпывает stallRetries и всё равно завершает задачу', async () => {
  const script = [] as string[]
  for (let i = 0; i < 10; i++) script.push(jsonCall('respond', { message: '' }))
  const { browser } = makeBrowser(script)
  const result = await runAgentLoop({ browser, tools: [respondTool], task: 'x', workdir: process.cwd() })
  assert.equal(result, '')
})

test('ответ-обещание без вызова инструмента не завершает задачу', async () => {
  const { browser, asks } = makeBrowser([
    'Now update README to mention system deps on Linux/WSL:',
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'done')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

test('русское «сейчас проверю» без вызова не завершает задачу', async () => {
  const { browser, asks } = makeBrowser([
    'Сейчас проверю тесты.',
    jsonCall('respond', { message: 'ok' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'ok')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

test('обычный финальный текст (без обещания) завершает задачу сразу', async () => {
  const { browser, asks } = makeBrowser(['Просто ответ без вызова'])
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'Просто ответ без вызова')
  assert.equal(asks.length, 1, 'ask calls: ' + asks.length)
})
