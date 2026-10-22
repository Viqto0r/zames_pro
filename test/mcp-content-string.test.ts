import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMcpResult } from '../src/mcp.ts'

// The MCP SDK always sends `content` as an ARRAY. A server that sends a
// STRING there (a buggy or hand-rolled server) is not an array, so the
// `for (const block of r.content || [])` loop iterated the STRING character by
// character: every letter was pushed as its own part and the result became
// `"n\n\no\n\nt\n\n \n\na\n\nn\n\n..."` instead of the text.
test('renderMcpResult: a string content is not split into characters', () => {
  assert.equal(renderMcpResult({ content: 'not an array' }), 'not an array')
})

test('renderMcpResult: a normal content array still joins the blocks', () => {
  assert.equal(
    renderMcpResult({
      content: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ],
    }),
    'a\n\nb',
  )
})
