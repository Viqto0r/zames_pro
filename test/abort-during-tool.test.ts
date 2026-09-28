import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

// Esc/Ctrl+C during a long-running tool: the tool itself may finish (we cannot
// kill an arbitrary child process), but the agent must NOT send its result
// back to the model and must NOT continue the batch — otherwise "stop" does
// nothing until the whole task is done.
test('abort during a tool stops the loop and does not send the result', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-abort-'))
  const asks: string[] = []
  let toolRan = false

  const browser: BrowserLike = {
    _abort: false,
    _stopped: false,
    async ask(text: string) {
      asks.push(text)
      return jsonCall('Slow', {})
    },
    async newChat() {},
    async getCurrentChatId() {
      return 'chat-abc'
    },
    async stopGeneration() {
      this._abort = true
      this._stopped = true
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
      name: 'Slow',
      description: 'slow tool',
      parameters: {},
      fn: async () => {
        toolRan = true
        // The operator pressed Esc while the tool was running.
        browser._abort = true
        browser._stopped = true
        return 'tool output'
      },
    },
    {
      name: 'respond',
      description: 'respond',
      parameters: { message: 'string' },
      fn: async (args) => String(args['message']),
    },
  ]

  const result = await runAgentLoop({
    browser,
    tools,
    task: 'x',
    workdir: dir,
  })

  assert.ok(toolRan, 'the tool must have run')
  assert.equal(result, '(прервано пользователем)')
  // Only the first send happened; the tool result was never sent back.
  assert.equal(asks.length, 1, 'ask calls: ' + asks.length)
})
