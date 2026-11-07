import { test } from 'node:test'
import assert from 'node:assert/strict'
import { performCompact } from '../src/compact.ts'
import type { BrowserLike } from '../src/types.ts'

// The happy path and the local fallback live in perform-compact.test.ts. This
// file pins the EDGE results the operator sees: no chat at all, a thrown
// NON-Error, the UI lock/unlock pairing and the carryover args.

const GOOD =
  'We read the parser, fixed the argument splitter and added a unit test for it.'

function baseBrowser(over: Partial<BrowserLike> = {}): BrowserLike {
  let chatId = 'old-chat'
  return {
    async ask() {
      return GOOD
    },
    async newChat() {
      chatId = 'new-chat'
    },
    async getCurrentChatId() {
      return chatId
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
    getLastTokenUsage: () => 1000,
    fetchChatMessages: async () => [],
    ...over,
  } as BrowserLike
}

function opts(browser: BrowserLike, over: Record<string, unknown> = {}) {
  return {
    browser,
    currentChatId: 'old-chat' as string | null,
    workdir: '/proj',
    locale: 'en' as const,
    buildSystemPrompt: () => 'SYS',
    tools: [],
    answerTimeoutMs: 60_000,
    quiet: true,
    ...over,
  }
}

test('no chat id at all fails without a send', async () => {
  let sent = 0
  const browser = baseBrowser({
    getCurrentChatId: async () => null,
    ask: async () => {
      sent++
      return GOOD
    },
  })
  const r = await performCompact(opts(browser, { currentChatId: null }))
  assert.equal(r.ok, false)
  assert.equal(r.chatId, null)
  assert.equal(r.summaryChars, 0)
  assert.equal(sent, 0)
})

test('a thrown NON-Error still yields a readable error', async () => {
  const browser = baseBrowser({
    newChat: async () => {
      throw 'disk on fire'
    },
  })
  const r = await performCompact(opts(browser))
  assert.equal(r.ok, false)
  assert.equal(r.error, 'disk on fire')
  // The old chat is reported (no new chat was opened).
  assert.equal(r.chatId, 'old-chat')
})

// NOT covered here: the all-attempts-failed path. It sleeps 3s+6s between the
// three summary attempts (by design, to spare the rate limit), so a test would
// add 9s to the suite for a retry loop that has its own coverage through the
// fallback file. The NON-Error and no-chat results above ARE the edge results
// the operator sees.

test('the UI is locked and unlocked around the work', async () => {
  const events: string[] = []
  const ui = {
    lock: () => events.push('lock'),
    unlock: () => events.push('unlock'),
    printAbove: () => events.push('print'),
  }
  const r = await performCompact(opts(baseBrowser(), { ui }))
  assert.equal(r.ok, true)
  assert.deepEqual(events, ['lock', 'unlock'])
})

test('skipUiLock leaves the UI alone', async () => {
  const events: string[] = []
  const ui = {
    lock: () => events.push('lock'),
    unlock: () => events.push('unlock'),
    printAbove: () => events.push('print'),
  }
  await performCompact(opts(baseBrowser(), { ui, skipUiLock: true }))
  assert.deepEqual(events, [])
})

test('the summary and the carryover are the two messages of the new chat', async () => {
  const asks: string[] = []
  const browser = baseBrowser({
    ask: async (text: string) => {
      asks.push(text)
      return asks.length === 1 ? GOOD : 'ok'
    },
  })
  const r = await performCompact(opts(browser, { task: 'fix the parser' }))
  assert.equal(r.ok, true)
  assert.equal(r.chatId, 'new-chat')
  // summary request, system prompt, carryover.
  assert.equal(asks.length, 3)
  assert.equal(asks[1], 'SYS')
  assert.ok(asks[2].includes(GOOD))
  assert.ok(asks[2].includes('Original task: fix the parser'))
})

test('the carried todos and goal ride inside the carryover', async () => {
  const asks: string[] = []
  const browser = baseBrowser({
    ask: async (text: string) => {
      asks.push(text)
      return asks.length === 1 ? GOOD : 'ok'
    },
  })
  await performCompact(
    opts(browser, {
      todos: [{ content: 'one', status: 'pending' }],
      goal: { goal: 'all green', isCondition: true },
    }),
  )
  assert.ok(asks[2].includes('## Task checklist'))
  assert.ok(asks[2].includes('## Completion goal'))
  assert.ok(asks[2].includes('all green'))
})

test('a successful compact reports the summary length and the token count', async () => {
  const r = await performCompact(opts(baseBrowser()))
  assert.equal(r.summaryChars, GOOD.length)
  assert.equal(r.beforeTokens, 1000)
})
