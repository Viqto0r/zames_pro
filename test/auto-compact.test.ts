import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike, ToolArgs } from '../src/types.ts'

// When the context is nearly full, the loop triggers onAutoCompact at the
// safe seam AFTER a tool result and BEFORE the next send. It fires at most
// once at the threshold and not again until the counter grows.

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

const echoTool: ToolDef = {
  name: 'Echo',
  description: 'echo',
  parameters: { v: 'string' },
  fn: async (_a: ToolArgs) => 'ok',
}

const respondTool: ToolDef = {
  name: 'respond',
  description: 'final',
  parameters: { message: 'string' },
  fn: async (a: ToolArgs) => String(a['message']),
}

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

test('auto-compact fires once at the threshold', async () => {
  // Two tool calls, then a final respond. Tokens start above the threshold.
  const script = [
    jsonCall('Echo', { v: '1' }),
    jsonCall('Echo', { v: '2' }),
    jsonCall('respond', { message: 'done' }),
  ]
  const { browser } = makeBrowser(script)
  let compactCalls = 0
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 20,
    onAutoCompact: async () => {
      compactCalls++
      return 'new-chat'
    },
    autoCompactPct: 90,
    contextLimit: 1000,
    getTokenUsage: () => 950,
  })
  assert.equal(result, 'done')
  assert.equal(compactCalls, 1, 'auto-compact must fire exactly once')
})

test('auto-compact does NOT fire below the threshold', async () => {
  const script = [
    jsonCall('Echo', { v: '1' }),
    jsonCall('respond', { message: 'done' }),
  ]
  const { browser } = makeBrowser(script)
  let compactCalls = 0
  await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 20,
    onAutoCompact: async () => {
      compactCalls++
      return 'new-chat'
    },
    autoCompactPct: 90,
    contextLimit: 1000,
    getTokenUsage: () => 100,
  })
  assert.equal(compactCalls, 0, 'below the threshold nothing fires')
})

test('an unknown token count skips auto-compact silently', async () => {
  const script = [
    jsonCall('Echo', { v: '1' }),
    jsonCall('respond', { message: 'done' }),
  ]
  const { browser } = makeBrowser(script)
  let compactCalls = 0
  await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 20,
    onAutoCompact: async () => {
      compactCalls++
      return 'new-chat'
    },
    autoCompactPct: 90,
    contextLimit: 1000,
    getTokenUsage: () => null,
  })
  assert.equal(compactCalls, 0)
})

// B3: a compaction that returns the SAME chat id (the fresh chat never opened)
// must not loop. Auto-compact is disabled for the rest of the task after one
// such result, with a warning to the operator.
test('auto-compact disables itself when it returns the same chat id', async () => {
  // Several tool calls: without the guard this would compact on every one.
  const script = [
    jsonCall('Echo', { v: '1' }),
    jsonCall('Echo', { v: '2' }),
    jsonCall('Echo', { v: '3' }),
    jsonCall('respond', { message: 'done' }),
  ]
  const { browser } = makeBrowser(script)
  // getCurrentChatId() returns 'chat-xyz' (see makeBrowser).
  let compactCalls = 0
  const warnings: string[] = []
  const result = await runAgentLoop({
    browser,
    tools: [echoTool, respondTool],
    task: 'x',
    workdir: process.cwd(),
    maxIterations: 20,
    onWarning: (m) => warnings.push(m),
    onAutoCompact: async () => {
      compactCalls++
      return 'chat-xyz' // same chat — the compaction did nothing
    },
    autoCompactPct: 1,
    contextLimit: 1000,
    getTokenUsage: () => 500,
  })
  assert.equal(result, 'done')
  assert.equal(compactCalls, 1, 'must compact at most once for the same chat')
  assert.ok(
    warnings.some((w) => /same id|тот же id/i.test(w)),
    'the operator must be warned: ' + JSON.stringify(warnings),
  )
})
