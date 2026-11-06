import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeTranscript } from '../src/commands.ts'

// A tool NAME is arbitrary text from a hand-edited transcript. `toolCounts`
// and `toolTime` are PLAIN objects, so a name like `__proto__` hits the
// prototype instead of an own key: the counter (`|| 0` on the inherited
// value) and the per-tool time silently change shape, and the object's own
// prototype is replaced. The same class as the tool-count maps fixed in /cost
// and jsonSchemaToParams.

function stats() {
  return summarizeTranscript([
    { type: 'tool_call', tool: '__proto__' },
    { type: 'tool_call', tool: '__proto__' },
    { type: 'tool_result', tool: '__proto__', durationMs: 500 },
    { type: 'tool_call', tool: 'Read' },
  ])
}

test('a __proto__ tool name is an own key with a real count', () => {
  const s = stats()
  assert.equal(
    Object.prototype.hasOwnProperty.call(s.toolCounts, '__proto__'),
    true,
  )
  assert.equal(
    Object.getOwnPropertyDescriptor(s.toolCounts, '__proto__')?.value,
    2,
  )
  assert.equal(
    Object.prototype.hasOwnProperty.call(s.toolTime, '__proto__'),
    true,
  )
})

test('the maps are null-prototype (no inherited keys at all)', () => {
  const s = stats()
  assert.equal(Object.getPrototypeOf(s.toolCounts), null)
  assert.equal(Object.getPrototypeOf(s.toolTime), null)
})

test('a normal tool is counted as before', () => {
  assert.equal(stats().toolCounts['Read'], 1)
})
