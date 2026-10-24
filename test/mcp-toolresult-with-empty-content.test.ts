// renderMcpResult() prefers `content` when it is present and only falls back
// to `toolResult` when `content` is ABSENT. A result that carries BOTH (an SDK
// server that attaches its payload as `toolResult` and an EMPTY/blank content
// list) rendered as "(no content)": the real output was silently dropped.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMcpResult } from '../src/mcp.ts'

test('toolResult is used when content carries nothing usable', () => {
  assert.equal(
    renderMcpResult({
      toolResult: 'payload',
      content: [{ type: 'text', text: '' }],
    }),
    'payload',
  )
  assert.equal(
    renderMcpResult({ toolResult: 'payload', content: [] }),
    'payload',
  )
})

test('real content still wins over toolResult (control)', () => {
  assert.equal(
    renderMcpResult({
      toolResult: 'ignored',
      content: [{ type: 'text', text: 'real' }],
    }),
    'real',
  )
})
