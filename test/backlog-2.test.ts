import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { Transcript } from '../src/transcript.ts'
import {
  filterToolsForReadOnly,
  createTools,
  mergeTools,
  MUTATING_TOOLS,
} from '../src/tools.ts'
import { floatingVersionWarnings, hardenPlaywrightArgs } from '../src/mcp.ts'
import { summarizeTranscript, parseTranscript } from '../src/commands.ts'

// ---------- Transcript jsonl mirror ----------

test('Transcript onLine mirrors events even when the file is disabled', () => {
  const lines: string[] = []
  const tr = new Transcript({
    dir: path.join(os.tmpdir(), 'zames-nope-' + Date.now()),
    enabled: false,
    onLine: (l) => lines.push(l),
  })
  tr.log('tool_call', { tool: 'Read' })
  tr.log('assistant_final', { message: 'done' })
  assert.equal(lines.length, 2)
  const first = JSON.parse(lines[0])
  assert.equal(first.type, 'tool_call')
  assert.equal(first.tool, 'Read')
  const second = JSON.parse(lines[1])
  assert.equal(second.type, 'assistant_final')
})

test('Transcript without onLine still writes the file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-tr-'))
  const tr = new Transcript({ dir, enabled: true, sessionName: 't' })
  tr.log('tool_call', { tool: 'Bash' })
  await tr.close()
  const f = tr.file as string
  const body = fs.readFileSync(f, 'utf-8')
  const entries = parseTranscript(body)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].type, 'tool_call')
})

test('Transcript.close flushes synchronously before resolving', async () => {
  // N9: the one-shot/exit paths used to call end() without waiting for the
  // flush, so the last events could be lost when the process exited. close()
  // now resolves only after the data reached the file.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-tr2-'))
  const tr = new Transcript({ dir, enabled: true, sessionName: 't' })
  tr.log('assistant_final', { message: 'done' })
  await tr.close()
  const body = fs.readFileSync(tr.file as string, 'utf-8')
  assert.ok(body.includes('assistant_final'))
})

test('Transcript.close on a disabled transcript resolves without a stream', async () => {
  const tr = new Transcript({
    dir: path.join(os.tmpdir(), 'zames-tr-none-' + Date.now()),
    enabled: false,
  })
  await assert.doesNotReject(() => tr.close())
})

test('Transcript.close is idempotent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-tr3-'))
  const tr = new Transcript({ dir, enabled: true, sessionName: 't' })
  tr.log('tool_call', { tool: 'Read' })
  await tr.close()
  await assert.doesNotReject(() => tr.close())
})

// ---------- plan mode still filters ----------

test('readOnly tools never include a mutating tool', () => {
  const tools = createTools(process.cwd(), { readOnly: true })
  for (const m of MUTATING_TOOLS) {
    assert.ok(!tools.some((t) => t.name === m), 'has ' + m)
  }
})

test('mergeTools filters MCP tools in read-only mode', () => {
  const base = createTools(process.cwd(), { readOnly: true })
  const mcp = [
    { name: 'srv__click', description: '', parameters: {}, fn: async () => '' },
    {
      name: 'srv__snapshot',
      description: '',
      parameters: {},
      fn: async () => '',
    },
  ]
  const merged = mergeTools(base, mcp, false)
  assert.ok(merged.some((t) => t.name === 'srv__click'))
  const ro = mergeTools(base, mcp, true)
  assert.ok(!ro.some((t) => t.name === 'srv__click'))
  assert.ok(ro.some((t) => t.name === 'srv__snapshot'))
})

// ---------- MCP floating version ----------

test('floatingVersionWarnings flags @latest and @next', () => {
  const w = floatingVersionWarnings({
    a: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
    b: { command: 'npx', args: ['@scope/pkg@next'] },
    c: { command: 'npx', args: ['pkg@1.2.3'] },
    d: { command: 'x', args: ['@latest'], disabled: true },
  })
  assert.deepEqual(w.sort(), ['a', 'b'])
})

test('floatingVersionWarnings is empty for a pinned config', () => {
  const w = floatingVersionWarnings({
    a: { command: 'npx', args: ['-y', '@playwright/mcp@0.0.30'] },
  })
  assert.deepEqual(w, [])
})

// ---------- /cost still summarizes tool counts ----------

test('summarizeTranscript keeps per-tool counts', () => {
  const stats = summarizeTranscript([
    { type: 'user_task' },
    { type: 'tool_call', tool: 'Read' },
    { type: 'tool_call', tool: 'Read' },
    { type: 'tool_call', tool: 'Edit' },
  ])
  assert.equal(stats.turns, 1)
  assert.equal(stats.toolCalls, 3)
  assert.equal(stats.toolCounts.Read, 2)
  assert.equal(stats.toolCounts.Edit, 1)
})

// ---------- MCP playwright hardening still applies ----------

test('hardenPlaywrightArgs adds --isolated only for playwright mcp', () => {
  assert.deepEqual(
    hardenPlaywrightArgs('npx', ['-y', '@playwright/mcp@latest']),
    ['-y', '@playwright/mcp@latest', '--isolated'],
  )
  assert.deepEqual(hardenPlaywrightArgs('npx', ['-y', 'other@1']), [
    '-y',
    'other@1',
  ])
})
