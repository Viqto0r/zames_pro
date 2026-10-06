import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import { parsePermissions } from '../src/permissions.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

function makeBrowser(script: string[]): BrowserLike {
  let i = 0
  return {
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
  } as BrowserLike
}

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

test('a deny rule blocks the tool: fn is never called', async () => {
  let ran = false
  const bash: ToolDef = {
    name: 'Bash',
    description: 'bash',
    parameters: { command: 'string' },
    fn: async () => {
      ran = true
      return 'ok'
    },
  }
  const respond: ToolDef = {
    name: 'respond',
    description: 'respond',
    parameters: { message: 'string' },
    fn: async (a) => String(a['message']),
  }
  const browser = makeBrowser([
    jsonCall('Bash', { command: 'rm -rf /' }),
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [bash, respond],
    task: 'x',
    workdir: process.cwd(),
    permissions: parsePermissions({
      rules: [{ tool: '^Bash$', action: 'deny' }],
    }),
  })
  assert.equal(result, 'done')
  assert.equal(ran, false, 'a denied tool must not run')
})

test('an ask rule denies when the operator says no', async () => {
  let ran = false
  const bash: ToolDef = {
    name: 'Bash',
    description: 'bash',
    parameters: { command: 'string' },
    fn: async () => {
      ran = true
      return 'ok'
    },
  }
  const respond: ToolDef = {
    name: 'respond',
    description: 'respond',
    parameters: { message: 'string' },
    fn: async (a) => String(a['message']),
  }
  const browser = makeBrowser([
    jsonCall('Bash', { command: 'ls' }),
    jsonCall('respond', { message: 'done' }),
  ])
  let asked = 0
  const result = await runAgentLoop({
    browser,
    tools: [bash, respond],
    task: 'x',
    workdir: process.cwd(),
    permissions: parsePermissions({
      rules: [{ tool: '^Bash$', action: 'ask' }],
    }),
    onAskPermission: async () => {
      asked++
      return false
    },
  })
  assert.equal(result, 'done')
  assert.equal(asked, 1)
  assert.equal(ran, false, 'a denied ask must not run the tool')
})

test('an ask rule allows when the operator says yes', async () => {
  let ran = false
  const bash: ToolDef = {
    name: 'Bash',
    description: 'bash',
    parameters: { command: 'string' },
    fn: async () => {
      ran = true
      return 'ok'
    },
  }
  const respond: ToolDef = {
    name: 'respond',
    description: 'respond',
    parameters: { message: 'string' },
    fn: async (a) => String(a['message']),
  }
  const browser = makeBrowser([
    jsonCall('Bash', { command: 'ls' }),
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [bash, respond],
    task: 'x',
    workdir: process.cwd(),
    permissions: parsePermissions({
      rules: [{ tool: '^Bash$', action: 'ask' }],
    }),
    onAskPermission: async () => true,
  })
  assert.equal(result, 'done')
  assert.equal(ran, true, 'an approved ask must run the tool')
})
