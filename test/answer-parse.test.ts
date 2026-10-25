import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseToolCall,
  responseLooksLikeToolCall,
  truncateToolResult,
} from '../src/answer-parse.ts'

// The tool-call parser and the small answer heuristics live in answer-parse.ts
// and are imported DIRECTLY from it: agent-loop.ts no longer re-exports them,
// so an accidental re-export (or a regression that moves them back) fails here.

test('answer-parse: the parser still works from its own module', () => {
  const res = parseToolCall('{"tool":"Read","args":{"path":"a.ts"}}')
  assert.ok(res && !Array.isArray(res))
  assert.equal((res as { tool: string }).tool, 'Read')
  assert.equal(responseLooksLikeToolCall('Готово, всё сделано.'), false)
  assert.equal(truncateToolResult('hi', 100), 'hi')
})
