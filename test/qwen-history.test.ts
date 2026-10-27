import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'

// One file for the whole parseQwenHistory shape matrix. Each block is a real
// payload variant that once broke `/resume` (an empty dialogue, a swapped
// speaker, a wrong order), so the tests stay together: one parser, every
// shape it must tolerate.

// --- the container shape ----------------------------------------------------
// The parser accepts `data.messages`, `data.chat.messages` and
// `data.chat.history.messages`, but when `history` is a BARE ARRAY the code did
// `hist.messages` on an array, got undefined, and returned NOTHING.
test('a bare array under chat.history is accepted', () => {
  const json = {
    data: {
      chat: {
        history: [
          { role: 'user', content: 'first', timestamp: 1 },
          { role: 'assistant', content: 'second', timestamp: 2 },
        ],
      },
    },
  }
  assert.deepEqual(
    parseQwenHistory(json).map((m) => m.text),
    ['first', 'second'],
  )
})

test('a bare array under chat.messages is accepted', () => {
  const json = {
    data: { chat: { messages: [{ role: 'assistant', content: 'hi' }] } },
  }
  assert.deepEqual(
    parseQwenHistory(json).map((m) => m.text),
    ['hi'],
  )
})

// The parser only looked INSIDE `root.data`, so a bare array reply (an older
// build, or the same simple shape the list endpoint uses) yielded an empty
// restored dialogue.
test('parseQwenHistory: a bare array of messages is parsed', () => {
  const msgs = parseQwenHistory([
    { role: 'user', content: 'question', timestamp: 1 },
    { role: 'assistant', content: 'answer', timestamp: 2 },
  ])
  assert.deepEqual(msgs, [
    { role: 'user', text: 'question' },
    { role: 'assistant', text: 'answer' },
  ])
})

test('parseQwenHistory: top-level `messages` without a data wrapper', () => {
  const msgs = parseQwenHistory({
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.deepEqual(msgs, [{ role: 'user', text: 'hi' }])
})

test('parseQwenHistory: the nested data.chat.history shape still works', () => {
  const msgs = parseQwenHistory({
    data: {
      chat: {
        history: {
          messages: { a: { role: 'user', content: 'q', timestamp: 1 } },
        },
      },
    },
  })
  assert.deepEqual(msgs, [{ role: 'user', text: 'q' }])
})

// --- the role field ---------------------------------------------------------
// `from` was NOT case-folded: only the exact lowercase 'user' counted, so a
// turn sent as `from: 'USER'` (or `from: 'human'`) was restored as the
// ASSISTANT's answer.
function role(m: Record<string, unknown>): string | undefined {
  return parseQwenHistory({
    data: { messages: { a: { content: 'x', timestamp: 1, ...m } } },
  })[0]?.role
}

test('parseQwenHistory reads an uppercase `from: USER` as the user', () => {
  assert.equal(role({ from: 'USER' }), 'user')
})

test('parseQwenHistory reads `from: human` as the user', () => {
  assert.equal(role({ from: 'human' }), 'user')
})

test('parseQwenHistory still reads `from: assistant` as the assistant', () => {
  assert.equal(role({ from: 'assistant' }), 'assistant')
})

// The role has also been seen as a NUMERIC flag. The parser only accepted the
// STRING '0' as "user": a numeric `role: 1` fell through to the assistant
// branch, so the operator's own prompts were attributed to the model.
function msg(role: unknown): Array<{ role: string }> {
  return parseQwenHistory({
    data: { messages: { a: { role, content: 'x', timestamp: 1 } } },
  })
}

test('a numeric user role (1) is read as the user', () => {
  assert.equal(msg(1)[0]?.role, 'user')
})

test('a numeric assistant role (2) is read as the assistant', () => {
  assert.equal(msg(2)[0]?.role, 'assistant')
})

test('the string forms still work', () => {
  assert.equal(msg('user')[0]?.role, 'user')
  assert.equal(msg('assistant')[0]?.role, 'assistant')
  assert.equal(msg('0')[0]?.role, 'user')
})

test('is_user boolean still works', () => {
  const r = parseQwenHistory({
    data: { messages: { a: { is_user: true, content: 'q', timestamp: 1 } } },
  })
  assert.equal(r[0]?.role, 'user')
})

// A SYSTEM turn is neither: the system prompt is stored in the history map as
// its own message, and mapping everything not-'user' to ASSISTANT printed it
// as a model ANSWER in /resume.
test('parseQwenHistory drops a SYSTEM turn', () => {
  const msgs = parseQwenHistory({
    data: [
      { role: 'user', content: 'hi' },
      { role: 'system', content: 'You are a coding agent...' },
      { role: 'assistant', content: 'hello' },
    ],
  })
  assert.deepEqual(msgs, [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'hello' },
  ])
})

test('parseQwenHistory still keeps a role-less turn as the assistant', () => {
  const msgs = parseQwenHistory({ data: [{ content: 'answer' }] })
  assert.deepEqual(msgs, [{ role: 'assistant', text: 'answer' }])
})

// --- ordering by timestamp --------------------------------------------------
// The history is a MAP keyed by message id, so the order is restored by
// sorting on `timestamp`; a message WITHOUT one sorts as 0, i.e. before every
// real stamp, reordering the whole conversation.
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

// A payload can carry an ISO stamp instead of a number: `Number('2026-…')` is
// NaN, the comparator kept the INSERTION order, and the model's answer was
// restored BEFORE the operator's question.
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

// --- the thinking phase -----------------------------------------------------
// `content_list` is phase-split output: a restored dialogue must keep only the
// ANSWER phase (the live SSE parser already skips `thinking_summary`).
test('parseQwenHistory skips the thinking phase in content_list', () => {
  const msgs = parseQwenHistory({
    data: {
      messages: {
        a: {
          role: 'assistant',
          content: '',
          content_list: [
            { phase: 'thinking_summary', content: 'INTERNAL REASONING' },
            { phase: 'answer', content: 'the answer' },
          ],
          timestamp: 1,
        },
      },
    },
  })
  assert.deepEqual(msgs, [{ role: 'assistant', text: 'the answer' }])
})

test('parseQwenHistory skips a part flagged as reasoning', () => {
  const msgs = parseQwenHistory({
    data: {
      messages: {
        a: {
          role: 'assistant',
          content_list: [
            { type: 'reasoning', content: 'why' },
            { type: 'text', content: 'visible' },
          ],
          timestamp: 1,
        },
      },
    },
  })
  assert.deepEqual(msgs, [{ role: 'assistant', text: 'visible' }])
})
