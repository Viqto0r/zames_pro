import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DeepSeekBrowser } from '../src/browser.ts'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { ToolDef, ToolArgs } from '../src/types.ts'

// The agent-loop watchdog races browser.ask() against a 240s deadline.
// When the timer wins the underlying ask() used to KEEP RUNNING (possibly
// inside a 300s rate-limit wait or the finish loop), while the next iteration
// started a SECOND ask() against the same page -- two sends / two Continue
// clicks. cancelPendingAsk() makes the in-flight ask bail out (and the loop
// awaits its settle before the next ask).

function fakePage(): unknown {
  return {
    async waitForTimeout() {},
  }
}

function browserSource(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return readFileSync(join(here, '..', 'src', 'browser.ts'), 'utf-8')
}

function loopSource(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return readFileSync(join(here, '..', 'src', 'agent-loop.ts'), 'utf-8')
}

test('cancelPendingAsk makes the in-flight ask sleep bail out', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = fakePage()
  b.cancelPendingAsk()
  const aborted = await b._sleepInterruptible(5000)
  assert.equal(aborted, true)
})

test('cancelPendingAsk sets the flag', () => {
  const b = new DeepSeekBrowser()
  const flag = () => (b as unknown as { _askCancelled: boolean })._askCancelled
  assert.equal(flag(), false)
  b.cancelPendingAsk()
  assert.equal(flag(), true)
})

test('the cancellation flag is reset at the start of _askOnce', () => {
  // A fresh send must not be cancelled by a stale cancellation from an
  // abandoned ask. The reset lives in _askOnce.
  assert.ok(/this\._askCancelled = false/.test(browserSource()))
})

test('_sleepInterruptible also honors the agent abort flag', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = fakePage()
  b._abort = true
  assert.equal(await b._sleepInterruptible(5000), true)
})

// Watchdog fires -> the loop cancels the in-flight ask and AWAITS its settle
// before the next iteration. The first ask() resolves only when
// cancelPendingAsk() is called (what the real _sleepInterruptible does); the
// next ask() returns the final respond.
test('the watchdog cancels the in-flight ask and continues', async () => {
  let cancelCalls = 0
  let askCalls = 0
  let releaseFirst: (() => void) | null = null
  const browser = {
    ask() {
      askCalls++
      if (askCalls === 1) {
        return new Promise<string>((resolve) => {
          releaseFirst = () => resolve('(прервано пользователем)')
        })
      }
      return Promise.resolve(
        JSON.stringify({ tool: 'respond', args: { message: 'done' } }),
      )
    },
    cancelPendingAsk() {
      cancelCalls++
      if (releaseFirst) releaseFirst()
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
  const respondTool: ToolDef = {
    name: 'respond',
    description: 'final',
    parameters: { message: 'string' },
    fn: async (a: ToolArgs) => a.message,
  }
  const result = await runAgentLoop({
    browser: browser as never,
    tools: [respondTool],
    task: 'x',
    workdir: process.cwd(),
    askDeadlineMs: 50,
  })
  assert.equal(result, 'done')
  assert.equal(cancelCalls, 1)
  assert.ok(askCalls >= 2)
})

test('the agent loop source awaits the cancelled ask before the next one', () => {
  // The settle await is what prevents two concurrent asks.
  assert.ok(/cancelPendingAsk\?\.\(\)/.test(loopSource()))
  assert.ok(/askPromise\.catch/.test(loopSource()))
})
