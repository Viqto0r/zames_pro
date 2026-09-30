import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDiff,
  diffGitArgs,
  summarizeTranscript,
  parseTranscript,
  formatDuration,
  renderCost,
  formatExport,
  defaultExportPath,
  renderDoctor,
  renderPermissions,
  resolveExtraDir,
  buildReviewPrompt,
  trimRestoredMessages,
  formatRestoredHistory,
  isDisplayableMessage,
  RESTORED_HISTORY_LIMIT,
} from '../src/commands.ts'

const NL = String.fromCharCode(10)
const Q = String.fromCharCode(34)

// ---------- /diff ----------

test('formatDiff: empty diff -> (no changes)', () => {
  assert.equal(formatDiff(''), '(no changes)')
  assert.equal(formatDiff(' '), '(no changes)')
})

test('formatDiff: short diff returns as-is', () => {
  const d = ['diff --git a/x b/x', '-old', '+new'].join(NL)
  assert.equal(formatDiff(d), d)
})

test('formatDiff: long diff is capped with a marker', () => {
  const lines = Array.from({ length: 10 }, (_, i) => 'line ' + i)
  const out = formatDiff(lines.join(NL), { maxLines: 3 })
  assert.ok(out.startsWith('line 0'))
  assert.ok(out.includes('more lines'))
  assert.ok(!out.includes('line 5'))
})

test('formatDiff: CRLF is normalized', () => {
  const out = formatDiff('a' + String.fromCharCode(13) + NL + 'b')
  assert.equal(out, 'a' + NL + 'b')
})

test('diffGitArgs: staged flag', () => {
  assert.equal(diffGitArgs(false), 'git diff')
  assert.equal(diffGitArgs(true), 'git diff --staged')
})

// ---------- /cost ----------

test('summarizeTranscript counts tasks, tools, duration', () => {
  const entries = [
    { type: 'user_task', ts: '2026-01-01T00:00:00Z', elapsed: 0 },
    { type: 'tool_call', tool: 'Read', elapsed: 100 },
    { type: 'tool_call', tool: 'Read', elapsed: 200 },
    { type: 'tool_call', tool: 'Bash', elapsed: 300 },
    { type: 'assistant_final', elapsed: 400 },
    { type: 'user_task', elapsed: 500 },
  ]
  const s = summarizeTranscript(entries)
  assert.equal(s.turns, 2)
  assert.equal(s.toolCalls, 3)
  assert.equal(s.toolCounts['Read'], 2)
  assert.equal(s.toolCounts['Bash'], 1)
  assert.equal(s.durationMs, 500)
  assert.equal(s.startedAt, '2026-01-01T00:00:00Z')
})

test('summarizeTranscript: empty list does not throw', () => {
  const s = summarizeTranscript([])
  assert.equal(s.turns, 0)
  assert.equal(s.toolCalls, 0)
  assert.equal(s.durationMs, 0)
})

test('parseTranscript skips broken lines', () => {
  const body = [
    JSON.stringify({ type: 'a' }),
    '{ broken',
    '',
    JSON.stringify({ type: 'b' }),
  ].join(NL)
  const out = parseTranscript(body)
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'a')
  assert.equal(out[1].type, 'b')
})

test('formatDuration formats h/m/s', () => {
  assert.equal(formatDuration(8000), '8s')
  assert.equal(formatDuration(5 * 60 * 1000 + 12000), '5m 12s')
  assert.equal(formatDuration(3661 * 1000), '1h 01m 01s')
  assert.equal(formatDuration(-5), '0s')
})

test('formatDuration honors localized unit labels', () => {
  const ru = { h: 'ч', m: 'м', s: 'с' }
  assert.equal(formatDuration(8000, ru), '8с')
  assert.equal(formatDuration(5 * 60 * 1000 + 12000, ru), '5м 12с')
  assert.equal(formatDuration(3661 * 1000, ru), '1ч 01м 01с')
})

test('renderCost contains key lines', () => {
  const out = renderCost(
    {
      turns: 2,
      toolCalls: 3,
      toolCounts: { Read: 2, Bash: 1 },
      durationMs: 8000,
      startedAt: 'x',
      autoCompacts: 0,
    },
    '/tmp/t.jsonl',
  )
  assert.ok(out.includes('tasks: 2'))
  assert.ok(out.includes('tool calls: 3'))
  assert.ok(out.includes('Read: 2'))
  assert.ok(out.includes('8s'))
  assert.ok(out.includes('/tmp/t.jsonl'))
  // No auto-compacts -> the line is omitted (not a noisy "0").
  assert.ok(!out.includes('auto-compacts'))
  // No token count passed -> an explicit "unknown" line, never a bogus 0.
  assert.ok(out.includes('context: unknown'))
})

test('renderCost shows the token context when known', () => {
  const out = renderCost(
    {
      turns: 1,
      toolCalls: 0,
      toolCounts: {},
      durationMs: 0,
      startedAt: null,
      autoCompacts: 0,
    },
    null,
    12345,
  )
  assert.ok(out.includes('12345 tokens'))
  assert.ok(!out.includes('context: unknown'))
})

test('summarizeTranscript counts auto-compacts', () => {
  const s = summarizeTranscript([
    { type: 'auto_compact_done' },
    { type: 'auto_compact_done' },
    { type: 'user_task' },
  ])
  assert.equal(s.autoCompacts, 2)
  assert.equal(s.turns, 1)
})

// ---------- /export ----------

test('formatExport builds markdown from the transcript', () => {
  const out = formatExport(
    [
      { type: 'user_task', task: 'do X' },
      { type: 'tool_call', tool: 'Read', args: { path: 'a' } },
      { type: 'tool_result', tool: 'Read', result: 'content' },
      { type: 'assistant_final', message: 'done' },
    ],
    { chatId: 'abc', workdir: '/w' },
  )
  assert.ok(out.includes('# zames session export'))
  assert.ok(out.includes('- workdir: /w'))
  assert.ok(out.includes('- chat: abc'))
  assert.ok(out.includes('- tasks: 1'))
  assert.ok(out.includes('- tool calls: 1'))
  assert.ok(out.includes('## Task'))
  assert.ok(out.includes('do X'))
  assert.ok(out.includes('tool Read'))
  assert.ok(out.includes('## Answer'))
  assert.ok(out.includes('done'))
})

test('defaultExportPath puts the file in workdir and ends with .md', () => {
  const p = defaultExportPath('/w', new Date('2026-01-02T03:04:05Z'))
  assert.ok(p.startsWith('/w/'))
  assert.ok(p.endsWith('.md'))
  assert.ok(!p.includes(':'))
})

// ---------- /doctor ----------

test('renderDoctor marks OK and WARN', () => {
  const out = renderDoctor({
    nodeVersion: 'v20',
    platform: 'linux',
    workdir: '/w',
    gitOk: false,
    configOk: true,
    browserChannel: null,
    clipboardTool: null,
    mcpServers: 0,
    mcpTools: 0,
    transcriptOk: true,
  })
  assert.ok(out.includes('[OK]'))
  assert.ok(out.includes('[WARN]'))
  assert.ok(out.includes('not a repository'))
  assert.ok(out.includes('no tool found'))
})

test('renderDoctor shows the context limit, git remote and send pause', () => {
  const out = renderDoctor({
    nodeVersion: 'v24',
    platform: 'linux',
    workdir: '/w',
    gitOk: true,
    gitBranch: 'master',
    configOk: true,
    browserChannel: null,
    clipboardTool: 'available',
    mcpServers: 0,
    mcpTools: 0,
    transcriptOk: true,
    contextLimit: 1_000_000,
    hasOrigin: true,
    minSendIntervalMs: 15000,
  })
  assert.ok(out.includes('1,000,000 tokens'), out)
  assert.ok(out.includes('origin configured'), out)
  assert.ok(out.includes('15s between agent sends'), out)
})

// ---------- /permissions ----------

test('renderPermissions shows modes and alwaysConfirm', () => {
  const out = renderPermissions({
    write: true,
    edit: false,
    bash: true,
    alwaysConfirm: ['rm' + Q + 's+-rf'],
  })
  assert.ok(out.includes('Write: ask'))
  assert.ok(out.includes('Edit: allow'))
  assert.ok(out.includes('Bash: ask'))
  assert.ok(out.includes('Always confirm'))
})

// ---------- /add-dir ----------

test('resolveExtraDir resolves a path and rejects empty input', () => {
  const ok = resolveExtraDir('sub', '/w') as { path: string }
  assert.equal(ok.path, '/w/sub')
  const empty = resolveExtraDir('', '/w') as { error: string }
  assert.ok(empty.error)
  const same = resolveExtraDir('.', '/w') as { error: string }
  assert.ok(same.error)
})

// ---------- /review ----------

test('buildReviewPrompt includes scope and focus', () => {
  const p = buildReviewPrompt('security')
  assert.ok(p.includes('uncommitted'))
  assert.ok(p.includes('Extra focus: security'))
  const staged = buildReviewPrompt('', true)
  assert.ok(staged.includes('staged'))
  assert.ok(!staged.includes('Extra focus'))
})

// ---------- restored dialogue ----------

test('trimRestoredMessages drops empties and keeps the tail', () => {
  const msgs = [
    { role: 'user' as const, text: 'a' },
    { role: 'assistant' as const, text: '  ' },
    { role: 'user' as const, text: 'b' },
    { role: 'assistant' as const, text: 'c' },
  ]
  const out = trimRestoredMessages(msgs, 2)
  assert.equal(out.length, 2)
  assert.equal(out[0].text, 'b')
  assert.equal(out[1].text, 'c')
})

test('trimRestoredMessages with 0 limit keeps everything', () => {
  const msgs = [
    { role: 'user' as const, text: 'a' },
    { role: 'assistant' as const, text: 'b' },
  ]
  assert.equal(trimRestoredMessages(msgs, 0).length, 2)
})

test('formatRestoredHistory marks roles', () => {
  const out = formatRestoredHistory(
    [
      { role: 'user', text: 'привет' },
      { role: 'assistant', text: 'ответ' },
    ],
    { limit: 10 },
  )
  assert.ok(out.includes('привет'))
  assert.ok(out.includes('ответ'))
  assert.ok(out.startsWith('❯ '))
})

test('RESTORED_HISTORY_LIMIT is a positive number', () => {
  assert.ok(RESTORED_HISTORY_LIMIT > 0)
})

// ---------- isDisplayableMessage ----------

test('isDisplayableMessage keeps a real user turn and a real answer', () => {
  assert.equal(
    isDisplayableMessage({ role: 'user', text: 'исправь баг в ask()' }),
    true,
  )
  assert.equal(
    isDisplayableMessage({ role: 'assistant', text: 'Готово, поправил.' }),
    true,
  )
})

test('isDisplayableMessage drops the protocol noise', () => {
  const noise = [
    { role: 'user' as const, text: 'Tool result for Bash:\nagent-loop.ts' },
    {
      role: 'user' as const,
      text: 'You are a coding agent running in a terminal. ...',
    },
    {
      role: 'user' as const,
      text: 'You stopped after a tool result. Continue...',
    },
    {
      role: 'assistant' as const,
      text: '{"tool": "Read", "args": {"path": "a.ts"}}',
    },
    {
      role: 'assistant' as const,
      text: '<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="Read">',
    },
    {
      role: 'assistant' as const,
      text: '<system>I need to look at...</system>',
    },
    { role: 'assistant' as const, text: '   ' },
  ]
  for (const m of noise) {
    assert.equal(isDisplayableMessage(m), false, JSON.stringify(m).slice(0, 60))
  }
})

// ---------- respond unwrapping (restored history) ----------

import { parseAssistantToolCall } from '../src/commands.ts'

test('trimRestoredMessages unwraps a respond call to its message', () => {
  const respond = JSON.stringify({
    tool: 'respond',
    args: { message: 'Готово, поправил ask().' },
  })
  const out = trimRestoredMessages([
    { role: 'user', text: 'исправь баг' },
    { role: 'assistant', text: respond },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[1].role, 'assistant')
  assert.equal(out[1].text, 'Готово, поправил ask().')
})

test('trimRestoredMessages drops a non-respond tool call', () => {
  const call = JSON.stringify({
    tool: 'Read',
    args: { path: 'src/browser.ts' },
  })
  const out = trimRestoredMessages([
    { role: 'user', text: 'вопрос' },
    { role: 'assistant', text: call },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].role, 'user')
})

test('trimRestoredMessages unwraps a respond call with escaped newlines', () => {
  const respond =
    '{"tool": "respond", "args": {"message": "Первая строка\\nВторая строка"}}'
  const out = trimRestoredMessages([{ role: 'assistant', text: respond }])
  assert.equal(out.length, 1)
  const NL = String.fromCharCode(10)
  assert.equal(out[0].text, 'Первая строка' + NL + 'Вторая строка')
})

test('trimRestoredMessages tolerates a dirty respond call (stray braces)', () => {
  const respond = '{"tool": "respond", "args": {"message": "ок"}}}'
  const out = trimRestoredMessages([{ role: 'assistant', text: respond }])
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'ок')
})

test('parseAssistantToolCall returns the tool name and the message', () => {
  assert.deepEqual(parseAssistantToolCall('{"tool":"Read","args":{}}'), {
    tool: 'Read',
  })
  const r = parseAssistantToolCall(
    '{"tool":"respond","args":{"message":"привет"}}',
  )
  assert.equal(r?.tool, 'respond')
  assert.equal(r?.message, 'привет')
  assert.equal(parseAssistantToolCall('просто текст'), null)
})
