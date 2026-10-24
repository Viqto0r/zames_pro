// /status prints counts that come from a live provider. The context counter
// already refuses a NEGATIVE value ("Context (tokens): -5" reads like a real
// measurement). The MCP tool count is the same kind of number: an MCP pool
// that reports a negative count (a broken server, a hand-edited status) was
// printed verbatim as "MCP tools: -2". Report it as unknown instead.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatStatus } from '../src/status-command.ts'

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
  tokenUsage: null,
}

test('/status does not print a negative MCP tool count', () => {
  const line = formatStatus({ ...base, mcpToolCount: -2 } as never).find((l) =>
    l.includes('MCP'),
  )
  assert.ok(line, 'the MCP row is missing')
  assert.ok(!line!.includes('-2'), 'negative count printed: ' + line)
})

test('a real zero MCP count still shows', () => {
  const line = formatStatus({ ...base, mcpToolCount: 0 } as never).find((l) =>
    l.includes('MCP'),
  )
  assert.ok(line && line.includes('0'), 'zero count lost: ' + line)
})
