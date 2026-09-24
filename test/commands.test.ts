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

test('renderCost contains key lines', () => {
 const out = renderCost(
 { turns: 2, toolCalls: 3, toolCounts: { Read: 2, Bash: 1 }, durationMs: 8000, startedAt: 'x' },
 '/tmp/t.jsonl',
 )
 assert.ok(out.includes('tasks: 2'))
 assert.ok(out.includes('tool calls: 3'))
 assert.ok(out.includes('Read: 2'))
 assert.ok(out.includes('8s'))
 assert.ok(out.includes('/tmp/t.jsonl'))
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
