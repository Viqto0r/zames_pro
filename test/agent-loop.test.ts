import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

const Q = String.fromCharCode(34)

function makeBrowser(script: string[]): {
  browser: BrowserLike
  asks: string[]
} {
  let i = 0
  let asked = false
  const asks: string[] = []
  const browser: BrowserLike = {
    async ask(text: string) {
      asks.push(text)
      asked = true
      const r = script[i]
      i++
      if (r === undefined) throw new Error('script exhausted')
      return r
    },
    async newChat() {},
    async getCurrentChatId() {
      return asked ? 'chat-xyz' : null
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

test('агент выполняет tool-call и передаёт результат модели', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-loop-'))
  await fs.writeFile(path.join(dir, 'a.txt'), 'file-content', 'utf-8')

  const tools: ToolDef[] = [
    {
      name: 'Read',
      description: 'read',
      parameters: { path: 'string' },
      fn: async (args) => fs.readFile(path.join(dir, String(args['path'])), 'utf-8'),
    },
    {
      name: 'respond',
      description: 'respond',
      parameters: { message: 'string' },
      fn: async (args) => String(args['message']),
    },
  ]

  const { browser, asks } = makeBrowser([
    jsonCall('Read', { path: 'a.txt' }),
    jsonCall('respond', { message: 'готово' }),
  ])

  const result = await runAgentLoop({
    browser,
    tools,
    task: 'прочитай файл',
    workdir: dir,
  })

  assert.equal(result, 'готово')
  // the second request to the model must contain the file read result
  assert.ok(asks[1].includes('file-content'), asks[1])
  await fs.rm(dir, { recursive: true, force: true })
})

test('respond завершает задачу и возвращает сообщение оператору', async () => {
  const { browser } = makeBrowser([jsonCall('respond', { message: 'финальный ответ' })])
  const result = await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'финальный ответ')
})

test('битый tool-call, похожий на вызов, не останавливает агента (просит переотправить)', async () => {
  const { browser, asks } = makeBrowser([
    'Вот вызов: {' + Q + 'tool' + Q + ': ' + Q + 'Read' + Q + ', broken',
    jsonCall('respond', { message: 'ok' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'ok')
  assert.equal(asks.length, 2, 'должен быть второй запрос после битого ответа')
  assert.ok(/не распознан|JSON/i.test(asks[1]) || asks[1].includes('respond'), asks[1])
})

test('обычный текст без вызова переспрашивается, завершает только respond', async () => {
 // STRICT MODE: plain text is not a final answer. The agent re-asks for a
 // tool call; only respond finishes the task.
 const { browser, asks } = makeBrowser([
 'Просто ответ без вызова',
 jsonCall('respond', { message: 'ok' }),
 ])
 const result = await runAgentLoop({
 browser,
 tools: [],
 task: 'x',
 workdir: process.cwd(),
 })
 assert.equal(result, 'ok')
 assert.ok(asks.length >= 2, 'должен быть переспрос после обычного текста')
})

test('onChatReady получает реальный chat id сразу после первой отправки', async () => {
  const { browser } = makeBrowser([jsonCall('respond', { message: 'ok' })])
  const seen: Array<string | null> = []
  await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: process.cwd(),
    freshChat: true,
    onChatReady: (id) => seen.push(id),
  })
  assert.ok(seen.includes('chat-xyz'), JSON.stringify(seen))
})

test('неизвестный инструмент возвращает ошибку модели, не роняя агент', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('Nope', { x: 1 }),
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'done')
  assert.ok(asks[1].includes('Неизвестный инструмент'), asks[1])
})

test('пустой/служебный ответ не завершает задачу, агент просит продолжить', async () => {
  const { browser, asks } = makeBrowser([
    'Reading',
    '',
    jsonCall('respond', { message: 'готово' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'готово')
  // The first answer (Reading) and an empty one — both should have led to a
  // repeated request, not a stop. So ask is called at least 3 times.
  assert.ok(asks.length >= 3, 'ask calls: ' + asks.length)
})

test('маркер прерывания не считается ответом и завершает задачу', async () => {
  const { browser } = makeBrowser(['(прервано пользователем)'])
  let toolCalls = 0
  const tools: ToolDef[] = [
    {
      name: 'Bash',
      description: 'bash',
      parameters: { command: 'string' },
      fn: async () => {
        toolCalls++
        return 'ok'
      },
    },
  ]
  const result = await runAgentLoop({
    browser,
    tools,
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, '(прервано пользователем)')
  assert.equal(toolCalls, 0)
})

test('первое сообщение идёт без agent, последующие (tool-result) — с agent', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-loop-'))
  await fs.writeFile(path.join(dir, 'a.txt'), 'x', 'utf-8')
  const calls: Array<{ prompt: string; opts?: { agent?: boolean } }> = []
  let i = 0
  const script = [
    jsonCall('Read', { path: 'a.txt' }),
    jsonCall('respond', { message: 'ok' }),
  ]
  const browser: BrowserLike = {
    async ask(text: string, opts?: { agent?: boolean }) {
      calls.push({ prompt: text, opts })
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
  const tools: ToolDef[] = [
    {
      name: 'Read',
      description: 'read',
      parameters: { path: 'string' },
      fn: async () => 'content',
    },
    {
      name: 'respond',
      description: 'respond',
      parameters: { message: 'string' },
      fn: async () => 'ok',
    },
  ]
  await runAgentLoop({ browser, tools, task: 'задача', workdir: dir })
  // The first ask — the user's task: agent is not set (falsy).
  assert.ok(!calls[0].opts || calls[0].opts.agent !== true, 'первое сообщение не должно быть agent')
  // The second ask — the agent's tool-result: agent: true.
  assert.equal(calls[1].opts?.agent, true)
})
