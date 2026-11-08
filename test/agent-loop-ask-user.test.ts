import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop } from '../src/agent-loop.ts'
import type { BrowserLike, ToolDef } from '../src/types.ts'
import { translate } from '../src/i18n.ts'

// The `AskUser` SEAM of the agent loop. The tool's own fn never runs: the loop
// validates the arguments, asks the injected `onAskUser`, and turns the answer
// into a tool result the model can act on. Every branch here decides whether
// the agent waits for a human or is told to pick a default and move on.

const t = translate('en')
const noTools: ToolDef[] = []

function makeBrowser(answer: (text: string) => string) {
  let turn = 0
  const browser = {
    async ask(text: string) {
      turn++
      return answer(text)
    },
    async newChat() {},
    async stopGeneration() {
      return true
    },
    async getCurrentChatId() {
      return 'chat-1'
    },
    async listChats() {
      return []
    },
    async close() {},
    _abort: false,
    _stopped: false,
    turn: () => turn,
  } as unknown as BrowserLike & { turn: () => number }
  return browser
}

function opts(
  browser: BrowserLike,
  onAskUser: unknown,
): Record<string, unknown> {
  return {
    browser,
    task: 'ask the operator',
    workdir: process.cwd(),
    tools: noTools,
    locale: 'en' as const,
    freshChat: false,
    sendSystemPrompt: false,
    t,
    getGitContext: async () => null,
    formatGitContext: () => '',
    loadProjectContext: async () => null,
    buildSystemPrompt: () => 'system',
    onAskUser,
    maxIterations: 4,
  }
}

const ASK =
  '{"tool":"AskUser","args":{"question":"which?","options":["a","b"],"recommended":1}}'

function finishAfterAsk() {
  let first = true
  return (text: string) => {
    if (first && !text.includes('system')) {
      first = false
      return ASK
    }
    return '{"tool":"respond","args":{"message":"done"}}'
  }
}

test('the operator answer is passed back to the model', async () => {
  const seen: unknown[] = []
  const browser = makeBrowser(finishAfterAsk())
  const out = await runAgentLoop(
    opts(browser, async (req: unknown) => {
      seen.push(req)
      return 'b'
    }) as never,
  )
  assert.equal(out, 'done')
  assert.deepEqual(seen, [
    {
      question: 'which?',
      options: ['a', 'b'],
      recommended: 1,
      allowText: true,
    },
  ])
})

test('a dismissed question tells the model to pick a default', async () => {
  const results: string[] = []
  const browser = makeBrowser(finishAfterAsk())
  await runAgentLoop(
    opts(browser, async () => {
      results.push('called')
      return null
    }) as never,
  )
  assert.deepEqual(results, ['called'])
})

test('a throwing onAskUser becomes an AskUser error string', async () => {
  const browser = makeBrowser(finishAfterAsk())
  const out = await runAgentLoop(
    opts(browser, async () => {
      throw new Error('modal crashed')
    }) as never,
  )
  assert.equal(out, 'done')
})

test('without onAskUser the model is told to choose a default', async () => {
  const browser = makeBrowser(finishAfterAsk())
  const out = await runAgentLoop(opts(browser, null) as never)
  assert.equal(out, 'done')
})

test('fewer than two options is rejected without asking', async () => {
  let asked = 0
  let first = true
  const browser = makeBrowser((text) => {
    if (first && !text.includes('system')) {
      first = false
      return '{"tool":"AskUser","args":{"question":"q","options":["only"]}}'
    }
    return '{"tool":"respond","args":{"message":"ok"}}'
  })
  const out = await runAgentLoop(
    opts(browser, async () => {
      asked++
      return 'x'
    }) as never,
  )
  assert.equal(out, 'ok')
  assert.equal(asked, 0)
})

test('an out-of-range recommended index becomes null', async () => {
  const seen: Array<{ recommended: unknown; allowText: unknown }> = []
  let first = true
  const browser = makeBrowser((text) => {
    if (first && !text.includes('system')) {
      first = false
      return '{"tool":"AskUser","args":{"question":"q","options":["a","b"],"recommended":5,"allow_text":false}}'
    }
    return '{"tool":"respond","args":{"message":"ok"}}'
  })
  await runAgentLoop(
    opts(browser, async (req: { recommended: unknown; allowText: unknown }) => {
      seen.push({ recommended: req.recommended, allowText: req.allowText })
      return 'a'
    }) as never,
  )
  assert.deepEqual(seen, [{ recommended: null, allowText: false }])
})
