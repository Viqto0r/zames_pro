import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderCost, summarizeTranscript } from '../src/commands.ts'

// `/cost` prints the transcript PATH and the session START timestamp. Both come
// from files the operator can hand-edit (a JSONL transcript, a session file),
// and neither was flattened: a newline in either started a row of its own in
// the report (the same rule every other value in this module follows).

const NL = String.fromCharCode(10)

function stats() {
  return summarizeTranscript([{ type: 'tool_call', tool: 'Read' }])
}

test('a newline in the transcript path stays on one line', () => {
  const out = renderCost(stats(), '/tmp/a' + NL + 'FAKE', null)
  assert.equal(out.includes(NL + 'FAKE'), false, JSON.stringify(out))
})

test('a newline in the start timestamp stays on one line', () => {
  const s = stats()
  s.startedAt = '2026-01-01' + NL + 'FAKE'
  const out = renderCost(s, null, null)
  assert.equal(out.includes(NL + 'FAKE'), false, JSON.stringify(out))
})
