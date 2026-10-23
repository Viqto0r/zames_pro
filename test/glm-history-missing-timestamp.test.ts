import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmHistory } from '../src/glm-chats.ts'

// Same shape as Qwen's history: a MAP keyed by message id whose order is
// restored by sorting on `timestamp`. `stampOf` returned 0 for a missing
// stamp, which sorts BEFORE every dated turn — a payload where only SOME
// messages carry a stamp reordered the dialogue (the operator's question
// surfaced after the model's answer).
test('a message without a timestamp keeps its place in the dialogue', () => {
  const json = {
    chat: {
      history: {
        messages: {
          m1: { role: 'user', content: 'Q1' },
          m2: { role: 'assistant', content: 'A1', timestamp: 1_730_000_010 },
          m3: { role: 'user', content: 'Q2' },
        },
      },
    },
  }
  assert.deepEqual(parseGlmHistory(json), [
    { role: 'user', text: 'Q1' },
    { role: 'assistant', text: 'A1' },
    { role: 'user', text: 'Q2' },
  ])
})

test('real timestamps still order a shuffled map', () => {
  const json = {
    chat: {
      history: {
        messages: {
          m3: { role: 'assistant', content: 'A1', timestamp: 1_730_000_050 },
          m1: { role: 'user', content: 'Q1', timestamp: 1_730_000_010 },
          m2: { role: 'user', content: 'Q2', timestamp: 1_730_000_060 },
        },
      },
    },
  }
  assert.deepEqual(parseGlmHistory(json), [
    { role: 'user', text: 'Q1' },
    { role: 'assistant', text: 'A1' },
    { role: 'user', text: 'Q2' },
  ])
})
