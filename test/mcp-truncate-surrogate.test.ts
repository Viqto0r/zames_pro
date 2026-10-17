import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateMcpResult } from '../src/mcp.ts'

// An MCP result (browser_snapshot, a big text block) is cut to MCP_RESULT_LIMIT
// before it becomes a tool result. A raw string slice can land BETWEEN the two
// halves of a surrogate pair (emoji / astral CJK), leaving a lone high
// surrogate in the model's context. Same rule as truncateToolResult /
// capReport / summarizeDiagnostics: never split a pair.

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1)
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true
      i++
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true
    }
  }
  return false
}

test('truncateMcpResult does not split a surrogate pair at the cut', () => {
  const emoji = String.fromCodePoint(0x1f600)
  const s = 'a'.repeat(10) + emoji + 'b'.repeat(20)
  const out = truncateMcpResult(s, 11)
  assert.equal(hasLoneSurrogate(out), false, JSON.stringify(out))
  assert.equal(out.startsWith('a'.repeat(10)), true)
})

test('truncateMcpResult does not split a pair on the line-boundary path', () => {
  const emoji = String.fromCodePoint(0x1f600)
  const NL = String.fromCharCode(10)
  const s = 'x'.repeat(10) + emoji + NL + 'y'.repeat(50)
  const out = truncateMcpResult(s, 11)
  assert.equal(hasLoneSurrogate(out), false, JSON.stringify(out))
})
