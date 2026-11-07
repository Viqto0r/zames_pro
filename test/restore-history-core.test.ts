import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RESTORED_HISTORY_LIMIT,
  stripThinkBlocks,
  stripUserFraming,
  trimRestoredMessages,
  formatRestoredHistory,
  isDisplayableMessage,
  unescapeJsonString,
} from '../src/restore-history.ts'

const NL = String.fromCharCode(10)

// restore-history renders a resumed chat. The provider-specific shapes have
// their own restored-*.test.ts files; this one pins the CORE helpers: the
// reasoning stripper, the user framing, the trim/limit and the rendered
// dialogue.

test('stripThinkBlocks drops a tagged reasoning block', () => {
  assert.equal(
    stripThinkBlocks('<think>secret reasoning</think>' + NL + 'the answer'),
    'the answer',
  )
  assert.equal(stripThinkBlocks('<reasoning>x</reasoning>answer'), 'answer')
})

test('stripThinkBlocks drops a fenced reasoning block', () => {
  assert.equal(
    stripThinkBlocks('```thinking' + NL + 'hmm' + NL + '```' + NL + 'answer'),
    'answer',
  )
})

test('stripThinkBlocks drops the Thought-for header line', () => {
  assert.equal(stripThinkBlocks('Thought for 1 second' + NL + 'OK2'), 'OK2')
  assert.equal(stripThinkBlocks('Think for 12s' + NL + 'done'), 'done')
})

test('stripThinkBlocks keeps an answer that OPENS with the same words', () => {
  const text = 'Think for a moment before answering: yes, do it.'
  assert.equal(stripThinkBlocks(text), text)
  const plain = 'Thought for sure this would work.'
  assert.equal(stripThinkBlocks(plain), plain)
})

test('stripThinkBlocks drops a header glued to the answer', () => {
  assert.equal(stripThinkBlocks('Thought for 1 secondOK2'), 'OK2')
})

test('stripThinkBlocks trims and tolerates an empty input', () => {
  assert.equal(stripThinkBlocks('  answer  '), 'answer')
  assert.equal(stripThinkBlocks(''), '')
  assert.equal(stripThinkBlocks(undefined as unknown as string), '')
})

test('stripUserFraming drops the system wrapper', () => {
  assert.equal(
    stripUserFraming('<system>You are an agent</system>' + NL + 'fix it'),
    'fix it',
  )
  assert.equal(stripUserFraming('fix it'), 'fix it')
})

test('unescapeJsonString turns the escaped forms into real characters', () => {
  assert.equal(
    unescapeJsonString('a' + String.fromCharCode(92) + 'nb'),
    'a' + NL + 'b',
  )
  assert.equal(unescapeJsonString('q' + String.fromCharCode(92) + '"q'), 'q"q')
})

test('trimRestoredMessages keeps only the LAST limit messages', () => {
  const msgs = [1, 2, 3, 4, 5].map((n) => ({
    role: n % 2 ? 'user' : 'assistant',
    text: 'm' + n,
  }))
  const out = trimRestoredMessages(msgs, 2)
  assert.deepEqual(
    out.map((m) => m.text),
    ['m4', 'm5'],
  )
  assert.equal(RESTORED_HISTORY_LIMIT, 20)
})

test('trimRestoredMessages skips a message without a string text', () => {
  const out = trimRestoredMessages(
    [
      { role: 'user', text: 'ok' },
      { role: 'user', text: 42 },
    ] as never,
    10,
  )
  assert.equal(out.length, 1)
})

test('trimRestoredMessages with limit 0 keeps everything', () => {
  const msgs = [1, 2, 3].map((n) => ({ role: 'user', text: 'm' + n }))
  assert.equal(trimRestoredMessages(msgs, 0).length, 3)
})

test('formatRestoredHistory marks the operator and the agent turns', () => {
  const text = formatRestoredHistory(
    [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ],
    { limit: 10 },
  )
  assert.equal(text, '❯ hi' + NL + NL + '● hello')
})

test('isDisplayableMessage refuses an empty assistant turn', () => {
  assert.equal(isDisplayableMessage({ role: 'user', text: 'hi' }), true)
  assert.equal(isDisplayableMessage({ role: 'assistant', text: '   ' }), false)
})
