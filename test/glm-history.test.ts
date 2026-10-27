import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGlmHistory } from '../src/glm-chats.ts'

// One file for the parseGlmHistory matrix: role mapping, ordering by
// timestamp and the content fallbacks. Each block is a payload variant that
// once made /resume print a scrambled or wrong dialogue.

// --- roles -------------------------------------------------------------------
// EVERY role that is not `user`/`human` was mapped to the assistant, so a
// SYSTEM turn (z.ai's own prompt) and a TOOL turn (the sandbox output of
// z.ai's agent runtime) were restored as model REPLIES. The Qwen parser
// already drops those roles.
test('parseGlmHistory: system and tool turns are dropped, not shown as answers', () => {
  const msgs = parseGlmHistory({
    messages: [
      { role: 'system', content: 'system prompt', timestamp: 1 },
      { role: 'tool', content: 'tool output', timestamp: 2 },
      { role: 'user', content: 'question', timestamp: 3 },
      { role: 'assistant', content: 'answer', timestamp: 4 },
    ],
  })
  assert.deepEqual(msgs, [
    { role: 'user', text: 'question' },
    { role: 'assistant', text: 'answer' },
  ])
})

test('parseGlmHistory: system and tool turns are dropped from BOTH fields', () => {
  // The live response carries `role` only; the parser must not invent a role
  // from an unobserved field. A turn whose ROLE is unknown stays the
  // assistant's (the safe default), while system/tool never appear.
  const msgs = parseGlmHistory({
    messages: [
      { role: 'SYSTEM', content: 'sys', timestamp: 1 },
      { role: 'tool', content: 'out', timestamp: 2 },
      { role: 'user', content: 'q', timestamp: 3 },
      { role: 'assistant', content: 'a', timestamp: 4 },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.role),
    ['user', 'assistant'],
  )
})

// --- the content fallbacks ---------------------------------------------------
test('parseGlmHistory: fragments and content_list are used when content is empty', () => {
  const msgs = parseGlmHistory({
    messages: [
      {
        role: 'assistant',
        fragments: [{ type: 'RESPONSE', content: 'from fragments' }],
        timestamp: 1,
      },
      {
        role: 'assistant',
        content_list: [
          { phase: 'thinking', content: 'reasoning' },
          { phase: 'answer', content: 'from list' },
        ],
        timestamp: 2,
      },
    ],
  })
  assert.deepEqual(
    msgs.map((m) => m.text),
    ['from fragments', 'from list'],
  )
})

// --- ordering ----------------------------------------------------------------
// The history is an UNORDERED map keyed by message id, so `timestamp` restores
// the order. `stampOf` returned 0 for a MISSING stamp (sorts before every
// dated turn) and `Number('2026-10-23T…')` is NaN (Array.sort keeps the
// insertion order) — both reordered the dialogue.
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
  assert.deepEqual(
    parseGlmHistory(body).map((m) => m.text),
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
