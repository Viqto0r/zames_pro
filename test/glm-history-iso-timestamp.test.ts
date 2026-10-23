import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmHistory } from '../src/glm-chats.ts'

// The history is an UNORDERED map keyed by message id; `timestamp` restores
// the dialogue order. The comparator used `Number(a.timestamp) - Number(b.timestamp)`
// and `Number(...)` on a STRING timestamp is fine — but a value like
// `"2026-10-23T10:00:00Z"` (an ISO stamp, not epoch) becomes NaN, and
// `NaN - NaN` is NaN: Array.sort treats a NaN comparator result as 0 and KEEPS
// THE INSERTION ORDER. The map order is arbitrary, so the restored dialogue
// came out scrambled (a question after its answer). The sort must fall back to
// a comparable numeric value for an ISO string.
test('an ISO timestamp orders the dialogue', () => {
  const body = {
    chat: {
      history: {
        messages: {
          b: {
            role: 'assistant',
            content: 'second',
            timestamp: '2026-10-23T10:00:05Z',
          },
          a: {
            role: 'user',
            content: 'first',
            timestamp: '2026-10-23T10:00:00Z',
          },
        },
      },
    },
  }
  const out = parseGlmHistory(body)
  assert.deepEqual(
    out.map((m) => m.text),
    ['first', 'second'],
  )
})

test('numeric and numeric-string timestamps still order', () => {
  const body = {
    messages: [
      { role: 'assistant', content: 'second', timestamp: '1700000100' },
      { role: 'user', content: 'first', timestamp: 1700000000 },
    ],
  }
  assert.deepEqual(
    parseGlmHistory(body).map((m) => m.text),
    ['first', 'second'],
  )
})
