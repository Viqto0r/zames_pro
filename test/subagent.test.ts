import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { runAgentLoop, type SubagentRequest } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

// N36: `Task` is a SEAM, not an ordinary tool. The agent loop must route it
// through onSubagent (a separate chat with an isolated context) and feed the
// returned report back as the tool result — never run it as a local fn.

function makeBrowser(script: string[]): {
  browser: BrowserLike
  asks: string[]
} {
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
      return 'chat-parent'
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

test('Task делегируется в onSubagent и его отчёт возвращается модели', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sub-'))
  const requests: SubagentRequest[] = []
  const tools: ToolDef[] = []

  // Turn 1: the model calls Task. Turn 2: it calls respond with the report.
  const { browser, asks } = makeBrowser([
    jsonCall('Task', {
      description: 'find the entry point',
      prompt: 'Find the entry point of the project.',
      subagent_type: 'explore',
    }),
    jsonCall('respond', { message: 'the entry point is src/index.ts' }),
  ])

  const final = await runAgentLoop({
    browser,
    tools,
    task: 'explore the repo',
    workdir: dir,
    onSubagent: async (req) => {
      requests.push(req)
      return { ok: true, text: 'ENTRY POINT REPORT' }
    },
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].type, 'explore')
  assert.equal(requests[0].prompt, 'Find the entry point of the project.')
  // The second send must carry the subagent report as the Task tool result.
  assert.ok(
    asks[1].includes('ENTRY POINT REPORT'),
    'the subagent report is fed back to the model',
  )
  assert.equal(final, 'the entry point is src/index.ts')
})

test('Task без onSubagent возвращает честную ошибку, не падая', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sub-'))
  const { browser, asks } = makeBrowser([
    jsonCall('Task', { prompt: 'do something' }),
    jsonCall('respond', { message: 'ok' }),
  ])

  const final = await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: dir,
    // no onSubagent
  })

  assert.ok(
    asks[1].includes('not available'),
    'the model is told the subagent is unavailable',
  )
  assert.equal(final, 'ok')
})

test('Task с пустым prompt не вызывает onSubagent', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sub-'))
  let called = 0
  const { browser, asks } = makeBrowser([
    jsonCall('Task', { prompt: '   ' }),
    jsonCall('respond', { message: 'ok' }),
  ])

  await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: dir,
    onSubagent: async () => {
      called++
      return { ok: true, text: 'nope' }
    },
  })

  assert.equal(called, 0)
  assert.ok(asks[1].includes('non-empty'))
})

test('subagent_type по умолчанию general', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sub-'))
  const seen: string[] = []
  const { browser } = makeBrowser([
    jsonCall('Task', { prompt: 'x' }),
    jsonCall('respond', { message: 'done' }),
  ])

  await runAgentLoop({
    browser,
    tools: [],
    task: 'x',
    workdir: dir,
    onSubagent: async (req) => {
      seen.push(req.type)
      return { ok: true, text: 'r' }
    },
  })

  assert.deepEqual(seen, ['general'])
})
