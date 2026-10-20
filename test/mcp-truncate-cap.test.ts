import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateMcpResult, MCP_RESULT_LIMIT } from '../src/mcp.ts'

// The cap exists to bound what one MCP call can put into the model's context.
// The marker line "[...truncated N chars]" (about 23 chars) was ADDED on top of
// a head that could already be `limit` long, so a big MCP result (a
// browser_snapshot) produced a result WIDER than the configured cap — the cap
// silently did not hold.
test('truncateMcpResult never returns more than the limit', () => {
  const body = 'x'.repeat(MCP_RESULT_LIMIT * 3)
  const out = truncateMcpResult(body)
  assert.ok(
    out.length <= MCP_RESULT_LIMIT,
    `result is ${out.length} chars, limit is ${MCP_RESULT_LIMIT}`,
  )
  assert.match(out, /truncated/)
})

// Same for a custom limit and a multi-line body (the line-boundary path).
test('truncateMcpResult holds the cap on the line-boundary path', () => {
  const line = 'y'.repeat(200)
  const body = Array.from({ length: 20 }, () => line).join(
    String.fromCharCode(10),
  )
  const out = truncateMcpResult(body, 500)
  assert.ok(out.length <= 500, `result is ${out.length} chars, limit is 500`)
})
