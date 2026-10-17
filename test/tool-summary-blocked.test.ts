// Unit tests for the STATUS ICON classifier (src/tool-summary.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeToolError } from '../src/tool-summary.js'

// The agent loop blocks a tool call WITHOUT a thrown error: a PreToolUse hook,
// the permission policy and the operator's denial all return their message AS
// the tool result (`Blocked by ...` / `Denied by ...`). Those calls never ran,
// so showing a green check next to them told the operator the tool succeeded.

test('looksLikeToolError: a blocked call is an error, not a success', () => {
  assert.equal(
    looksLikeToolError('Blocked by permission policy: rule tool=^Bash$'),
    true,
  )
  assert.equal(looksLikeToolError('Blocked by PreToolUse hook: rm -rf'), true)
  assert.equal(looksLikeToolError('Denied by operator: rule tool=^Bash$'), true)
})

test('looksLikeToolError: an aborted/timed-out call is not a success', () => {
  assert.equal(
    looksLikeToolError('⏱ Timeout after 30000ms — process killed.'),
    true,
  )
  assert.equal(looksLikeToolError('(aborted by the operator)'), true)
})

test('looksLikeToolError: an unknown tool / subagent refusal is an error', () => {
  assert.equal(looksLikeToolError('Unknown tool: Nope'), true)
  assert.equal(
    looksLikeToolError('Subagents are not available in this run.'),
    true,
  )
})

test('looksLikeToolError: a normal result is still a success', () => {
  assert.equal(looksLikeToolError('read 120 lines'), false)
  assert.equal(looksLikeToolError('Started in background with id bg-1.'), false)
})
