import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

// The history is a MAP keyed by message id, so the dialogue order is restored
// by sorting on `timestamp`. A message WITHOUT one sorts as 0, i.e. BEFORE
// every real timestamp — so a payload where only SOME messages carry a stamp
// (a partially migrated store, a tool/system turn without one, a hand-built
// fixture) reordered the whole conversation: the operator's own question was
// restored AFTER the model's answer, which reads as "the agent answered before
// it was asked".
test('a message without a timestamp keeps its place in the dialogue', () => {
  const json = {
    data: {
      chat: {
        history: {
          messages: {
            m1: { role: 'user', content: 'Q1' },
            m2: { role: 'assistant', content: 'A1', timestamp: 1_730_000_010 },
            m3: { role: 'user', content: 'Q2' },
          },
        },
      },
    },
  }
  assert.deepEqual(parseQwenHistory(json), [
    { role: 'user', text: 'Q1' },
    { role: 'assistant', text: 'A1' },
    { role: 'user', text: 'Q2' },
  ])
})

// An explicit timestamp still orders the dialogue (the whole reason for the
// sort): map order is not chronological.
test('timestamps order a shuffled map', () => {
  const json = {
    data: {
      chat: {
        history: {
          messages: {
            m3: { role: 'assistant', content: 'A1', timestamp: 1_730_000_050 },
            m1: { role: 'user', content: 'Q1', timestamp: 1_730_000_010 },
            m2: { role: 'user', content: 'Q2', timestamp: 1_730_000_060 },
          },
        },
      },
    },
  }
  assert.deepEqual(parseQwenHistory(json), [
    { role: 'user', text: 'Q1' },
    { role: 'assistant', text: 'A1' },
    { role: 'user', text: 'Q2' },
  ])
})
