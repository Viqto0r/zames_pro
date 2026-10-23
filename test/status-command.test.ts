import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatStatus } from '../src/status-command.js'
import { translate } from '../src/i18n.js'
import type { StatusInput } from '../src/status-command.js'

const t = translate('en')

function base(p: Partial<StatusInput> = {}): StatusInput {
  return {
    workdir: '/p',
    reviewMode: null,
    chatId: null,
    freshNext: true,
    promptNext: false,
    lastChat: null,
    sessionsDir: '/h/.zames/.sessions',
    devMode: false,
    maxIterations: 0,
    headless: true,
    debug: false,
    deepThinking: false,
    webSearch: true,
    undo: true,
    checkpoint: true,
    transcriptFile: null,
    goal: null,
    localeName: 'English',
    mcpToolCount: null,
    tokenUsage: null,
    ...p,
  }
}

test('formatStatus: every line is rendered even for a bare session', () => {
  const lines = formatStatus(base(), t)
  assert.equal(lines.length, 19)
})

test('formatStatus: a missing chat / goal / MCP / tokens say none', () => {
  const out = formatStatus(base(), t).join('\n')
  assert.match(out, /none/)
  assert.match(out, /unknown/)
})

test('formatStatus: the orig dir row appears ONLY in review mode', () => {
  const plain = formatStatus(base({ origDir: '/orig' }), t).join('\n')
  assert.ok(!/\/orig/.test(plain))
  const review = formatStatus(
    base({ reviewMode: 'snap1', origDir: '/orig' }),
    t,
  ).join('\n')
  assert.match(review, /snap1/)
  assert.match(review, /\/orig/)
})

test('formatStatus: numbers are printed, not dropped', () => {
  const out = formatStatus(
    base({ maxIterations: 0, tokenUsage: 12345, mcpToolCount: 0 }),
    t,
  ).join('\n')
  assert.match(out, /0/)
  assert.match(out, /12345/)
})
