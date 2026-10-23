// The restored dialogue silently DROPS an assistant message longer than 100k
// chars (`normalizeRestoredMessage`: "the system-prompt / a giant blob"). That
// cap was meant for a leaked SYSTEM PROMPT, but a real answer can exceed it —
// a long report, a pasted diff, a generated document. The drop is silent, so
// the operator saw a dialogue where the agent's own reply was MISSING with no
// indication at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRestoredMessage } from '../src/commands.js'

const longAnswer = 'Report line. '.repeat(8000) // ~104k chars, no protocol noise

test('a long but ordinary answer is not dropped from the restore', () => {
  const n = normalizeRestoredMessage({ role: 'assistant', text: longAnswer })
  assert.ok(n, 'the answer must survive normalization')
  assert.equal(n!.role, 'assistant')
  assert.ok(n!.text.length > 0)
})

test('a leaked system prompt is still dropped', () => {
  const sys = 'You are a coding agent running in a terminal. '.repeat(4000)
  assert.equal(normalizeRestoredMessage({ role: 'user', text: sys }), null)
})
