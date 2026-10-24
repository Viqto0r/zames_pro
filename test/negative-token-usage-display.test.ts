// The context counter comes from the provider and can be a NONSENSE value (a
// proxy build wrapping an int, a hand-edited history, a bug). A negative
// count was printed verbatim — `context: ~-5 tokens` in /cost and
// `Context (tokens): -5` in /status — which reads like a real measurement.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderCost, summarizeTranscript } from '../src/commands.ts'
import { formatStatus } from '../src/status-command.ts'

const stats = summarizeTranscript([])

test('/cost does not print a negative token count', () => {
  const line = renderCost(stats, null, -5).split('\n')[1]
  assert.ok(!line.includes('-5'), 'negative count printed: ' + line)
})

test('/status does not print a negative token count', () => {
  const base = {
    workdir: '/w',
    reviewMode: null,
    chatId: null,
    freshNext: false,
    promptNext: false,
    lastChat: null,
    sessionsDir: '/s',
    devMode: false,
    maxIterations: 0,
    headless: true,
    debug: false,
    deepThinking: false,
    webSearch: false,
    undo: true,
    checkpoint: true,
    transcriptFile: null,
    goal: null,
    localeName: 'en',
    mcpToolCount: 0,
    tokenUsage: -5,
  }
  const line = formatStatus(base as never).find((l) => l.includes('tokens'))
  assert.ok(line && !line.includes('-5'), 'negative count printed: ' + line)
})

test('a real zero still shows (control)', () => {
  const line = renderCost(stats, null, 0).split('\n')[1]
  assert.match(line, /0/)
})
