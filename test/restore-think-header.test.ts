import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripThinkBlocks } from '../src/restore-history.ts'

// The reasoning header is `Thought for N seconds`. The old rule matched any
// `think(s|ing)? for <anything>` at the start of the text and dropped the whole
// line, so a plain answer that OPENS with the same words ("Thinking for a
// moment, here is the result:") lost its first line — the restored dialogue
// showed a reply that started mid-sentence.
const NL = String.fromCharCode(10)

test('a reasoning header line is removed', () => {
  assert.equal(stripThinkBlocks('Thought for 1 second' + NL + 'OK2'), 'OK2')
  assert.equal(stripThinkBlocks('Think for 12s' + NL + 'answer'), 'answer')
})

test('an answer that OPENS with the same words keeps its line', () => {
  const text = 'Thinking for a moment, here is the result: 42'
  assert.equal(stripThinkBlocks(text), text)
  const text2 = 'Thinking for the win: the refactor is done'
  assert.equal(stripThinkBlocks(text2), text2)
})

test('a header glued to the answer is still dropped', () => {
  // Live DOM shape: the header without its newline, then the answer.
  assert.equal(stripThinkBlocks('Thought for 1 secondOK2'), 'OK2')
})
