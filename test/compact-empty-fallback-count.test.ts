import { test } from 'node:test'
import assert from 'node:assert/strict'
import { performCompact } from '../src/compact.ts'
import type { BrowserLike } from '../src/types.ts'

// When neither the model summary nor the history fallback produced anything,
// performCompact reports WHY the local fallback was empty. A history that came
// back with messages but no DISPLAYABLE turns (every message was protocol
// noise, so `trimRestoredMessages` returned nothing) is reported as "history
// too short" — with the count it was built from. The count concatenation sat
// OUTSIDE the error string, so `error` lost the `(N)` suffix while the printed
// log line kept it: every caller that reports the REASON (auto-compact notice,
// /doctor) showed a bare, uncounted message.

const noop = (): void => {}

function browserWithNoise(): BrowserLike {
  let newChats = 0
  return {
    async ask() {
      // The old chat cannot summarize itself: an unusable tool-call JSON.
      return '{"tool": "Bash", "args": {}}'
    },
    async newChat() {
      newChats++
    },
    async getCurrentChatId() {
      return newChats ? 'new-chat' : 'old-chat'
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
    getLastTokenUsage: () => null,
    fetchChatMessages: async () => [
      { role: 'user' as const, text: 'Tool result for Bash:\nok' },
      { role: 'assistant' as const, text: '{"tool":"Read","args":{}}' },
      { role: 'user' as const, text: '[system] nudge' },
    ],
  }
}

test('an empty fallback reason keeps its message count', async () => {
  const res = await performCompact({
    browser: browserWithNoise(),
    currentChatId: 'old-chat',
    workdir: '/tmp',
    locale: 'en',
    transcript: { log: noop },
    buildSystemPrompt: () => 'SYS',
    tools: [],
    answerTimeoutMs: 60000,
  })
  assert.equal(res.ok, false, String(res.error))
  assert.match(String(res.error), /\(3\)$/, String(res.error))
})
