import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseToolCall,
  responseLooksLikeToolCall,
  truncateToolResult,
} from '../src/answer-parse.ts'

// C3: the tool-call parser and the small answer heuristics were extracted from
// agent-loop.ts into answer-parse.ts. They are imported DIRECTLY from here (the
// old re-export from agent-loop.ts was removed in C3b).

test('answer-parse: the parser still works from its own module', () => {
  const res = parseToolCall('{"tool":"Read","args":{"path":"a.ts"}}')
  assert.ok(res && !Array.isArray(res))
  assert.equal((res as { tool: string }).tool, 'Read')
  assert.equal(responseLooksLikeToolCall('Готово, всё сделано.'), false)
  assert.equal(truncateToolResult('hi', 100), 'hi')
})
