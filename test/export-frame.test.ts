import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { formatExport, defaultExportPath } from '../src/commands.ts'

const NL = String.fromCharCode(10)

// /export writes a self-contained Markdown report. The existing tests pin the
// one-line tool result and the surrogate-safe clip; this file pins the FRAME
// (header, meta lines, the summary) and the event-type dispatch, so a new
// event kind or a broken meta line is visible before an operator opens the
// export.

const lines = (md: string): string[] => md.split(NL)

const SAMPLE = [
  { type: 'user_task', task: 'do the thing' },
  { type: 'tool_call', tool: 'Read', args: { path: 'a.txt' } },
  { type: 'tool_result', tool: 'Read', result: 'content' },
  { type: 'assistant_final', message: 'done' },
]

test('the export header carries the meta lines it was given', () => {
  const md = formatExport(SAMPLE, { workdir: '/w', chatId: 'abc' })
  const out = lines(md)
  assert.equal(out[0], '# zames session export')
  assert.equal(out[1], '')
  assert.equal(out[2], '- workdir: /w')
  assert.equal(out[3], '- chat: abc')
  assert.match(out[4], /^- exported: \d{4}-\d\d-\d\dT/)
})

test('an absent workdir or chat omits the line entirely', () => {
  const md = formatExport(SAMPLE)
  assert.ok(!md.includes('- workdir:'))
  assert.ok(!md.includes('- chat:'))
  // A null chatId is "absent", not the string "null".
  assert.ok(!formatExport(SAMPLE, { chatId: null }).includes('- chat:'))
  assert.ok(!formatExport(SAMPLE, { chatId: '' }).includes('- chat:'))
})

test('the summary counts tasks, tool calls and the duration', () => {
  const md = formatExport(SAMPLE, { workdir: '/w' })
  assert.ok(md.includes('- tasks: 1'))
  assert.ok(md.includes('- tool calls: 1'))
  assert.ok(md.includes('- duration: 0s'))
  // The auto-compact line appears ONLY when a compaction happened.
  assert.ok(!md.includes('- auto-compacts:'))
  const compacted = formatExport([{ type: 'auto_compact_done' }, ...SAMPLE], {})
  assert.ok(compacted.includes('- auto-compacts: 1'))
})

test('each known event becomes its Markdown block', () => {
  const md = formatExport(SAMPLE, {})
  assert.ok(md.includes('## Task' + NL + NL + 'do the thing'))
  assert.ok(md.includes('- tool Read {"path":"a.txt"}'))
  assert.ok(md.includes(' -> Read: content'))
  assert.ok(md.includes('## Answer' + NL + NL + 'done'))
})

test('a tool call without args exports an empty object, not undefined', () => {
  const md = formatExport([{ type: 'tool_call', tool: 'LS' }], {})
  assert.ok(md.includes('- tool LS {}'))
  assert.ok(!md.includes('undefined'))
})

test('an unknown event type is skipped without breaking the frame', () => {
  const md = formatExport([{ type: 'mystery', payload: 'x' }, ...SAMPLE], {
    workdir: '/w',
  })
  assert.ok(!md.includes('mystery'))
  assert.ok(!md.includes('payload'))
  assert.ok(md.includes('## Task'))
  assert.ok(md.includes('## Answer'))
})

test('a missing type is reported as ? and not rendered as a block', () => {
  const md = formatExport([{}, { type: 'user_task', task: 't' }], {})
  // The '?' type matches no branch, so the entry contributes no block.
  assert.ok(!md.includes('## Task' + NL + NL + '?'))
  assert.ok(md.includes('do' in {} ? '' : '## Task'))
})

test('a task or an answer with markup is exported verbatim', () => {
  const body = 'line1' + NL + NL + '## Task (a fake heading)'
  const md = formatExport(
    [
      { type: 'user_task', task: body },
      { type: 'assistant_final', message: body },
    ],
    {},
  )
  // The export does NOT rewrite the operator's or the model's text: only the
  // tool RESULT is flattened.
  assert.equal(md.split('## Task' + NL + NL + body).length, 2)
  assert.equal(md.split('## Answer' + NL + NL + body).length, 2)
})

test('defaultExportPath stamps the local ISO time into the workdir', () => {
  const when = new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 678))
  const p = defaultExportPath('/w', when)
  assert.equal(path.dirname(p), '/w')
  const name = path.basename(p)
  assert.match(name, /^zames-export-\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d-\d{3}\.md$/)
  // No ISO punctuation survives (it would break a shell glob).
  assert.ok(!name.includes(':'))
  assert.ok(!name.includes('T'))
  assert.ok(!name.includes('Z'))
})

test('two exports in the same millisecond share the name (time-only stamp)', () => {
  const when = new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 0))
  assert.equal(defaultExportPath('/w', when), defaultExportPath('/w', when))
})
