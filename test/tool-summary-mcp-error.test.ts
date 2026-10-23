// The status icon classifier (src/tool-summary.ts) drives the ✔/✖ glyph next
// to a tool result in the TUI. An MCP failure is reported AS A RESULT STRING
// (never thrown): `MCP error: …` when the server answers isError, and
// `MCP error (server/tool): …` when the call itself throws. Neither prefix was
// recognised, so a failed MCP call was drawn with a green check.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeToolError } from '../src/tool-summary.js'

test('looksLikeToolError: an MCP failure is an error, not a success', () => {
  assert.equal(looksLikeToolError('MCP error: boom'), true)
  assert.equal(
    looksLikeToolError('MCP error (srv/tool): connection closed'),
    true,
  )
})

test('looksLikeToolError: a normal MCP result is still a success', () => {
  assert.equal(looksLikeToolError('Page snapshot: …'), false)
})
