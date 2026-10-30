import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeRestoredMessage,
  stripThinkBlocks,
  stripUserFraming,
  toolCallOf,
  trimRestoredMessages,
} from '../src/restore-history.ts'

// The restored-dialogue filter used to live inside the DeepSeek DOM scraper,
// so Qwen/GLM printed the RAW stored text: tool calls, the reasoning block and
// the provider's own framing. These cases pin the provider-neutral rules.

test('a tool call in EVERY format the parser knows is dropped', () => {
  const calls = [
    JSON.stringify({ tool: 'Read', args: { path: 'a.ts' } }),
    '{"tool": "Bash", "args": {"command": "ls"}}',
    '<|DSML|invoke name="Grep"><|DSML|parameter name="pattern">x</|DSML|parameter></|DSML|invoke>',
    '<invoke name="Write"><parameter name="path">a</parameter></invoke>',
  ]
  for (const c of calls) {
    assert.equal(
      normalizeRestoredMessage({ role: 'assistant', text: c }),
      null,
      c.slice(0, 40),
    )
  }
})

test('a respond call is unwrapped, whatever its syntax', () => {
  const json = JSON.stringify({ tool: 'respond', args: { message: 'готово' } })
  assert.deepEqual(
    normalizeRestoredMessage({ role: 'assistant', text: json }),
    { role: 'assistant', text: 'готово' },
  )
})

test('a plain prose answer that MENTIONS a tool is kept', () => {
  const text = 'Я вызвал Bash и всё прошло: tool: Bash вернул 0.'
  assert.deepEqual(normalizeRestoredMessage({ role: 'assistant', text }), {
    role: 'assistant',
    text,
  })
})

test('the reasoning block is removed from the answer', () => {
  assert.equal(
    stripThinkBlocks(
      'Thought for 1 second' + String.fromCharCode(10, 10) + 'Ответ',
    ),
    'Ответ',
  )
  assert.equal(stripThinkBlocks('<thinking>We need</thinking>Ответ'), 'Ответ')
  assert.equal(
    stripThinkBlocks(
      '```thinking' +
        String.fromCharCode(10) +
        'plan' +
        String.fromCharCode(10) +
        '```' +
        String.fromCharCode(10) +
        'Ответ',
    ),
    'Ответ',
  )
})

test('a message with only reasoning is not shown', () => {
  assert.equal(
    normalizeRestoredMessage({
      role: 'assistant',
      text: 'Thought for 3 seconds',
    }),
    null,
  )
})

test('a <system> block is stripped from a user turn', () => {
  assert.equal(
    stripUserFraming('<system>rules</system> исправь баг'),
    'исправь баг',
  )
  assert.deepEqual(
    normalizeRestoredMessage({
      role: 'user',
      text: '<system>x</system> исправь баг',
    }),
    { role: 'user', text: 'исправь баг' },
  )
})

test('the /compact handover is not a user turn of the restored dialogue', () => {
  assert.equal(
    normalizeRestoredMessage({
      role: 'user',
      text: 'Compact the conversation so far into a handover summary for a NEW chat.',
    }),
    null,
  )
})

test('toolCallOf does not re-parse ordinary prose', () => {
  assert.equal(toolCallOf('The tool: Read is a file reader.'), null)
  assert.equal(toolCallOf('{"tool":"Read","args":{"path":"x"}}')?.tool, 'Read')
})

test('a Qwen-style history is normalized into a readable dialogue', () => {
  const out = trimRestoredMessages([
    { role: 'user', text: 'почини тест' },
    {
      role: 'assistant',
      text: '{"tool":"Bash","args":{"command":"npm test"}}',
    },
    {
      role: 'user',
      text: 'Tool result for Bash:' + String.fromCharCode(10) + 'fail',
    },
    {
      role: 'assistant',
      text:
        'Thought for 4 seconds' +
        String.fromCharCode(10, 10) +
        '{"tool":"respond","args":{"message":"починил"}}',
    },
  ])
  assert.deepEqual(out, [
    { role: 'user', text: 'почини тест' },
    { role: 'assistant', text: 'починил' },
  ])
})
