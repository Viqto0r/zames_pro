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

test('вызов инструмента в одинарных кавычках выполняется, а не принимается за финал', async () => {
  // Ровно тот случай, из-за которого агент вставал: модель отдала
  // {'tool': 'Read', ...} (одинарные кавычки) — не валидный JSON.
  const SQ = String.fromCharCode(39)
  const pseudo =
    '{' + SQ + 'tool' + SQ + ': ' + SQ + 'Read' + SQ + ', ' +
    SQ + 'args' + SQ + ': {' + SQ + 'path' + SQ + ': ' + SQ + 'src/undo.ts' + SQ + '}}'
  let readCalled = 0
  const readTool: ToolDef = {
    name: 'Read',
    description: 'Read',
    parameters: { path: 'string' },
    fn: async (a) => {
      readCalled++
      return 'file contents of ' + String(a['path'])
    },
  }
  const { browser, asks } = makeBrowser([
    pseudo,
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [readTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'done')
  assert.equal(readCalled, 1, 'Read должен выполниться, а не «потеряться»')
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

test('длинный ответ со словами про rate limit не считается служебным', async () => {
  // В транскрипте был ответ на 1365 символов, где агент цитирует код
  // ask() и слова «слишком часто». Он ошибочно принимался за служебный
  // и вызывал лишний переспрос.
  const long =
    'Да, именно так сейчас и сделано — повтор идёт в тот же чат.' +
    String.fromCharCode(10, 10) +
    'Смотри ask(), строки 499–517: при RateLimitError ждём и повторяем, ' +
    'сообщение «слишком часто» обрабатывается отдельно. ' +
    'x'.repeat(300)
  const { browser, asks } = makeBrowser([long])
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, long)
  assert.equal(asks.length, 1, 'ask calls: ' + asks.length)
})

test('короткое уведомление о лимите по-прежнему вызывает переспрос', async () => {
  const { browser, asks } = makeBrowser([
    'Messages too frequent. Please try again later.',
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
