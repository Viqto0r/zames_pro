import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

const NL = String.fromCharCode(10)

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

// A large tool call that got truncated by DeepSeek (the answer was cut off
// mid-content). The nudge must tell the model to SPLIT the call, not just
// resend the same huge one — otherwise it truncates again and the agent looks
// "stopped after a tool call".
test('large truncated tool call -> nudge says to split the call', async () => {
  const big = 'x'.repeat(4000)
  const truncated =
    'Now let me write the file.' + NL + NL +
    '{"tool":"Write","args":{"path":"src/big.ts","content":"' + big
  const { browser, asks } = makeBrowser([
    truncated,
    jsonCall('respond', { message: 'done' }),
  ])
  const result = await runAgentLoop({
    browser,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
  })
  assert.equal(result, 'done')
  const nudge = asks[1]
  assert.ok(/split/i.test(nudge), 'nudge should mention splitting: ' + nudge)
  assert.ok(/content_base64/.test(nudge), 'nudge should mention content_base64: ' + nudge)
})

// A SHORT malformed call keeps the generic example nudge (no split advice).
test('short malformed tool call -> generic nudge, no split advice', async () => {
  const { browser, asks } = makeBrowser([
    '{"tool": "Bash", "args": {"comm',
    jsonCall('respond', { message: 'ok' }),
  ])
  await runAgentLoop({ browser, tools: [respondTool], task: 'x', workdir: process.cwd() })
  const nudge = asks[1]
  assert.ok(!/content_base64/.test(nudge), 'short call should not get the split advice: ' + nudge)
})
