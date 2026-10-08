import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as loop from '../src/agent-loop.ts'
import * as pure from '../src/answer-parse.ts'

// C3: the tool-call parser and the small answer heuristics were extracted from
// agent-loop.ts into answer-parse.ts. agent-loop.ts must RE-EXPORT the
// public names by identity, so every existing importer keeps working.

test('agent-loop.ts re-exports the pure helpers by identity', () => {
  for (const n of [
    'parseToolCall',
    'responseLooksLikeToolCall',
    'truncateToolResult',
  ] as const) {
    assert.equal(
      (loop as Record<string, unknown>)[n],
      (pure as Record<string, unknown>)[n],
      `${n} is not the same binding in agent-loop.ts and answer-parse.ts`,
    )
  }
})

test('answer-parse: the parser still works from its own module', () => {
  const res = pure.parseToolCall('{"tool":"Read","args":{"path":"a.ts"}}')
  assert.ok(res && !Array.isArray(res))
  assert.equal((res as { tool: string }).tool, 'Read')
  assert.equal(pure.responseLooksLikeToolCall('Готово, всё сделано.'), false)
  assert.equal(pure.truncateToolResult('hi', 100), 'hi')
})
