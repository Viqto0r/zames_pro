// formatStatus() renders `/status` lines. The session GOAL is operator text
// (set with `/goal <free text>`) and was printed VERBATIM: a newline started a
// new terminal line, so a goal could fake another status row (`FAKE: hacked`)
// or a doctor-style `[OK] …` line. One status entry must stay on one line.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatStatus } from '../src/status-command.ts'
import { translate } from '../src/i18n.ts'

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
  webSearch: true,
  undo: true,
  checkpoint: false,
  transcriptFile: null,
  goal: null as string | null,
  localeName: 'en',
  mcpToolCount: 0,
  tokenUsage: null as number | null,
}

test('a multi-line goal does not add a fake status line', () => {
  const out = formatStatus(
    { ...base, goal: 'line1\nFAKE: hacked' } as never,
    translate('en'),
  ).join('\n')
  for (const line of out.split('\n')) {
    assert.equal(
      line.startsWith('FAKE:'),
      false,
      'injected line in /status: ' + JSON.stringify(out),
    )
  }
  assert.ok(out.includes('line1 FAKE: hacked'), out)
})

test('an ordinary goal is unchanged', () => {
  const out = formatStatus(
    { ...base, goal: 'all tests pass' } as never,
    translate('en'),
  ).join('\n')
  assert.ok(out.includes('Session goal: all tests pass'), out)
})
