// parseQwenHistory() restores the dialogue order from `timestamp`.
// The value is a NUMBER (seconds) in the builds seen so far, but a payload can
// carry an ISO stamp instead. GLM's parser already falls back to Date.parse
// for a non-numeric string — Qwen did not: `Number('2026-10-23T…')` is NaN, the
// comparator kept the INSERTION order, and a map whose order differs from the
// real chronology restored the model's answer BEFORE the operator's question.
// A message whose stamp is ONLY usable as a date must still sort by date.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

test('ISO timestamps restore the dialogue order', () => {
  const out = parseQwenHistory({
    data: {
      messages: [
        {
          role: 'user',
          content: 'question',
          timestamp: '2026-10-23T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'answer',
          timestamp: '2026-10-23T09:00:00Z',
        },
      ],
    },
  })
  assert.deepEqual(
    out.map((m) => m.role),
    ['assistant', 'user'],
    JSON.stringify(out),
  )
})

test('numeric-string timestamps keep sorting numerically', () => {
  const out = parseQwenHistory({
    data: {
      messages: [
        { role: 'user', content: 'question', timestamp: '200' },
        { role: 'assistant', content: 'answer', timestamp: '100' },
      ],
    },
  })
  assert.deepEqual(
    out.map((m) => m.role),
    ['assistant', 'user'],
    JSON.stringify(out),
  )
})

test('a half-stamped payload keeps insertion order', () => {
  const out = parseQwenHistory({
    data: {
      messages: [
        { role: 'user', content: 'q1', timestamp: 100 },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2', timestamp: 50 },
      ],
    },
  })
  assert.deepEqual(
    out.map((m) => m.text),
    ['q1', 'a1', 'q2'],
    JSON.stringify(out),
  )
})
