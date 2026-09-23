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
  // Exactly the case that made the agent stall: the model returned
  // {'tool': 'Read', ...} (single quotes) — not valid JSON.
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

test('пустой respond исчерпывает stallRetries и не завершается пустотой молча', async () => {
  const script = [] as string[]
  for (let i = 0; i < 10; i++) script.push(jsonCall('respond', { message: '' }))
  const { browser } = makeBrowser(script)
  const warnings: string[] = []
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 12,
    onWarning: (m) => warnings.push(m),
  })
  // An empty respond must never be a silent final: instead of returning an
  // empty string, the loop warns the operator (no "stopped after a tool" effect).
  assert.notEqual(result, '')
  assert.ok(result.length > 0, 'результат не должен быть пустым: ' + JSON.stringify(result))
  assert.ok(warnings.length >= 1, 'оператор должен получить предупреждение')
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

test('обычный текст без вызова переспрашивается; завершает только respond', async () => {
 const { browser, asks } = makeBrowser([
 'Просто ответ без вызова',
 jsonCall('respond', { message: 'итог' }),
 ])
 const result = await runAgentLoop({
 browser,
 tools: [respondTool],
 task: 'x',
 workdir: process.cwd(),
 })
 assert.equal(result, 'итог')
 assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})
test('длинный ответ со словами про rate limit не считается служебным', async () => {
 // The transcript had a 1365-char answer where the agent quotes the ask()
 // code and the words "too frequent". It must NOT be taken as a service
 // answer (that caused a long re-ask loop). In strict mode it is still
 // plain text, so the agent re-asks once, then finishes on respond.
 const long =
 'Да, именно так сейчас и сделано — повтор идёт в тот же чат.' +
 String.fromCharCode(10, 10) +
 'Смотри ask(), строки 499–517: при RateLimitError ждём и повторяем, ' +
 'сообщение «слишком часто» обрабатывается отдельно. ' +
 'x'.repeat(300)
 const { browser, asks } = makeBrowser([long, jsonCall('respond', { message: 'ok' })])
 const result = await runAgentLoop({
 browser,
 tools: [respondTool],
 task: 'x',
 workdir: process.cwd(),
 })
 assert.equal(result, 'ok')
 assert.equal(asks.length, 2, 'ask calls: ' + asks.length)
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

test('подозрительный финал (похож на вызов) вызывает onWarning оператору', async () => {
  // The model keeps returning a broken tool call. Each guard (malformed,
  // then strict plain-text) asks to resend; after exhausting them - onWarning.
  const broken = '{"tool": "Bash", "args": {"command": "ls'
  const script = new Array(10).fill(broken)
  const { browser } = makeBrowser(script)
  const warnings: string[] = []
  await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'test',
    workdir: process.cwd(),
    maxIterations: 20,
    onWarning: (m) => warnings.push(m),
  })
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].length > 0)
})

// ---------------------------------------------------------------------------
// Regression: "the agent called a tool and stopped". The transcript showed
// turns where, right after tool_result, the model returned an empty / stale /
// unparseable fragment and the loop went silent (no assistant_raw, no error).
// These tests pin the guards that must re-ask instead of finishing.
// ---------------------------------------------------------------------------

const echoTool: ToolDef = {
  name: 'Echo',
  description: 'echo',
  parameters: { v: 'string' },
  fn: async () => 'echo-ok',
}

test('после инструмента «Stale. Let me ...» без вызова переспрашивается, а не завершает', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('Echo', { v: '1' }),
    'Stale. Let me verify the tarball.',
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

test('после инструмента обрезанный JSON не завершает задачу (watchdog no-call)', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('Echo', { v: '1' }),
    '{"tool": "Echo", "args": {"v": "2"',
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

test('после инструмента фрагмент-«обещание» без вызова переспрашивается', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('Echo', { v: '1' }),
    'Now let me run the tests.',
    jsonCall('respond', { message: 'ok' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'ok')
  assert.ok(asks.length >= 3, 'ask calls: ' + asks.length)
})

test('после инструмента пустой ответ переспрашивается несколько раз, потом respond', async () => {
  const { browser, asks } = makeBrowser([
    jsonCall('Echo', { v: '1' }),
    '   ',
    '   ',
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 20,
  })
  assert.equal(result, 'done')
  assert.ok(asks.length >= 4, 'ask calls: ' + asks.length)
})

test('no silent finish: после инструмента лимит сторожей исчерпан — оператор предупреждён', async () => {
  // The model calls a tool, then returns empty forever. The loop must NOT
  // return silently: at the limit it warns the operator (onWarning) and logs
  // the event. The tool call itself is valid, so the respond tool never runs.
  const script: string[] = [jsonCall('Echo', { v: '1' })]
  for (let i = 0; i < 30; i++) script.push('')
  const { browser } = makeBrowser(script)
  const warnings: string[] = []
  const events: string[] = []
  const transcript = {
    log: (event: string) => {
      events.push(event)
    },
  }
  await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 40,
    onWarning: (m) => warnings.push(m),
    transcript,
  })
  assert.ok(warnings.length >= 1, 'оператор должен получить предупреждение')
  assert.ok(
    events.includes('watchdog_nudge') ||
      events.includes('plaintext_final') ||
      events.includes('ask_timeout'),
    'события: ' + JSON.stringify(events.slice(-6)),
  )
})

test('обычный текст после инструмента не печатается оператору как финал', async () => {
  // Strict mode + bounded retries: after a tool, plain text is re-asked a few
  // times (the SINGLE unparsedRetries budget), then respond finishes. The
  // budget is small on purpose: the old 11+ re-asks caused the "agent hang".
  const script: string[] = [jsonCall('Echo', { v: '1' })]
  for (let i = 0; i < 3; i++) script.push('Вот что я сделал: всё готово.')
  script.push(jsonCall('respond', { message: 'final' }))
  const { browser, asks } = makeBrowser(script)
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 30,
  })
  assert.equal(result, 'final')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

// ---------------------------------------------------------------------------
// Regression: respond mixed with a real tool call in ONE answer.
// DeepSeek returns [{"tool":"Edit",...},{"tool":"respond",...}]. Handling
// respond first DROPPED the tool call and the agent looked "stopped after a
// tool call". The tool must run; respond only finishes when it is alone.
// ---------------------------------------------------------------------------
test('respond в одном ответе с инструментом не теряет инструмент', async () => {
  let echoRuns = 0
  const countingEcho: ToolDef = {
    name: 'Echo',
    description: 'echo',
    parameters: { v: 'string' },
    fn: async () => {
      echoRuns++
      return 'ok'
    },
  }
  const { browser, asks } = makeBrowser([
    JSON.stringify([
      { tool: 'Echo', args: { v: '1' } },
      { tool: 'respond', args: { message: 'premature' } },
    ]),
    jsonCall('respond', { message: 'final-ok' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [countingEcho, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 10,
  })
  assert.equal(echoRuns, 1, 'инструмент должен выполниться, а не потеряться')
  assert.equal(result, 'final-ok')
  assert.ok(asks.length >= 2, 'ask calls: ' + asks.length)
})

test('повторяющийся текст-обещание в финале даёт предупреждение оператору', async () => {
  // The model keeps repeating "Stale. Let me verify the tarball." and never
  // calls a tool. At the end its own text used to be printed SILENTLY, so the
  // operator saw the agent "stop" on a promise. Now it must warn.
  const same = 'Stale. Let me verify the tarball.'
  const script: string[] = [jsonCall('Echo', { v: '1' })]
  for (let i = 0; i < 10; i++) script.push(same)
  const { browser } = makeBrowser(script)
  const warnings: string[] = []
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 25,
    onWarning: (m) => warnings.push(m),
  })
  assert.ok(warnings.length >= 1, 'оператор должен получить предупреждение')
  assert.ok(result.length > 0)
})
