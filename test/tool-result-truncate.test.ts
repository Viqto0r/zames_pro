import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToolResult } from '../src/agent-loop.ts'

// A huge tool result used to be sliced silently (12_000 / 8000 chars),
// so the model could not tell it was looking at a PARTIAL output. The cap now
// appends an explicit marker.
test('a short result is returned unchanged', () => {
  assert.equal(truncateToolResult('hello', 100), 'hello')
})

test('an exactly-at-limit result is returned unchanged', () => {
  const s = 'x'.repeat(100)
  assert.equal(truncateToolResult(s, 100), s)
})

test('a long result carries an explicit truncation marker', () => {
  const s = 'x'.repeat(500)
  const out = truncateToolResult(s, 100)
  assert.ok(out.startsWith('x'.repeat(100)))
  assert.match(out, /\[\.\.\.truncated 400 chars\]/)
})

test('the marker reports the real number of omitted chars', () => {
  const s = 'y'.repeat(1234)
  const out = truncateToolResult(s, 1000)
  assert.match(out, /\[\.\.\.truncated 234 chars\]/)
})
