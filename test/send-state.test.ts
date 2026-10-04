import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { runAgentLoop } from '../src/agent-loop.ts'
import { LineEditor } from '../src/input.ts'
import type { ToolDef, BrowserLike } from '../src/types.ts'

function jsonCall(tool: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool, args })
}

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
  }
}

// The lifecycle hook must be wired to the agent loop and forwarded, so the
// status line can show an explicit phase without touching send timings.
test('onSendState is wired and forwarded to the UI callback', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-sendstate'))
  const tools: ToolDef[] = [
    {
      name: 'respond',
      description: 'respond',
      parameters: { message: 'string' },
      fn: (args) => String(args['message']),
    },
  ]
  const browser = makeBrowser([jsonCall('respond', { message: 'готово' })])
  const originalAsk = browser.ask.bind(browser)
  browser.ask = async function (this: BrowserLike, prompt: string) {
    if (this.onSendState) this.onSendState('generating')
    if (this.onSendState) this.onSendState('settled')
    return originalAsk(prompt)
  } as BrowserLike['ask']
  const states: string[] = []

  await runAgentLoop({
    browser,
    tools,
    task: 'privet',
    workdir: dir,
    onSendState: (s) => states.push(s),
  })

  assert.deepEqual(states, ['generating', 'settled'])
})

// The editor prefix must reflect the state and be cleared by stop().
test('LineEditor setSendState renders the phase prefix and stop() clears it', () => {
  const e = new LineEditor()
  let renders = 0
  e._render = () => {
    renders++
  }
  assert.equal(e._stateLabel(), '')
  e.setSendState('generating')
  assert.equal(e._sendState, 'generating')
  assert.ok(e._stateLabel().length > 0)
  assert.ok(renders >= 1)
  // An unknown value clears the phase (idle).
  e.setSendState('nonsense')
  assert.equal(e._sendState, '')
  // 'settled' shows a short "done" prefix so the transition from "generating"
  // to "answer finished" is visible; stop() still clears it below.
  e.setSendState('settled')
  assert.ok(e._stateLabel().length > 0)
  // stop() also drops the phase so it cannot leak into the next status.
  e.stop()
  assert.equal(e._sendState, '')
  assert.equal(e._stateLabel(), '')
})
