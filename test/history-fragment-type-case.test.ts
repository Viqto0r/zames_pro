import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHistoryMessages } from '../src/browser-chats.ts'

// `parseHistoryMessages` matches the ROLE case-insensitively (a lowercase
// `assistant` was once printed as the operator's own text), but the FRAGMENT
// type was compared with a strict `fr.type !== 'RESPONSE'`. A payload that
// spells the types in lowercase — a proxy build, a JSON round-trip through a
// normalizer — made EVERY fragment skip, so the restored dialogue came back
// EMPTY even though it carried both the question and the answer.
test('fragment types are matched case-insensitively', () => {
  const res = parseHistoryMessages([
    { role: 'USER', fragments: [{ type: 'request', content: 'question' }] },
    { role: 'ASSISTANT', fragments: [{ type: 'response', content: 'answer' }] },
  ])
  assert.deepEqual(res.list, [
    { role: 'user', text: 'question' },
    { role: 'assistant', text: 'answer' },
  ])
})

test('the usual uppercase payload is unchanged', () => {
  const res = parseHistoryMessages([
    { role: 'USER', fragments: [{ type: 'REQUEST', content: 'q' }] },
    { role: 'ASSISTANT', fragments: [{ type: 'RESPONSE', content: 'a' }] },
  ])
  assert.deepEqual(res.list, [
    { role: 'user', text: 'q' },
    { role: 'assistant', text: 'a' },
  ])
})

test('a THINK fragment still never becomes the answer', () => {
  const res = parseHistoryMessages([
    {
      role: 'ASSISTANT',
      fragments: [
        { type: 'think', content: 'reasoning' },
        { type: 'response', content: 'answer' },
      ],
    },
  ])
  assert.deepEqual(res.list, [{ role: 'assistant', text: 'answer' }])
})

// The SAME strict comparison lived in the Qwen and GLM history parsers (a
// DeepSeek-style `fragments[]` payload is accepted there as a safety net), so
// a lowercase type emptied those restored dialogues too.
test('Qwen and GLM parsers match the fragment type case-insensitively', async () => {
  const { parseQwenHistory } = await import('../src/qwen-chats.ts')
  const { parseGlmHistory } = await import('../src/glm-chats.ts')
  const qwen = parseQwenHistory({
    data: {
      chat: {
        history: {
          messages: [
            { role: 'user', fragments: [{ type: 'request', content: 'q' }] },
            {
              role: 'assistant',
              fragments: [{ type: 'response', content: 'a' }],
            },
          ],
        },
      },
    },
  })
  assert.deepEqual(qwen, [
    { role: 'user', text: 'q' },
    { role: 'assistant', text: 'a' },
  ])
  const glm = parseGlmHistory({
    chat: {
      history: {
        messages: [
          { role: 'user', fragments: [{ type: 'request', content: 'q' }] },
          {
            role: 'assistant',
            fragments: [{ type: 'response', content: 'a' }],
          },
        ],
      },
    },
  })
  assert.deepEqual(glm, [
    { role: 'user', text: 'q' },
    { role: 'assistant', text: 'a' },
  ])
})
