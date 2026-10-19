import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHistoryMessages } from '../src/browser-chats.ts'

// The history endpoint uses UPPERCASE roles, but the parser only recognized
// `ASSISTANT` exactly: a lowercase `assistant` fell into the user branch and a
// SYSTEM/TOOL turn was read as an OPERATOR message. In the restored dialogue
// (/resume, /resume-id) the assistant's own answer was printed as the operator's
// text and service turns were attributed to the operator.
test('parseHistoryMessages reads a lowercase assistant role as assistant', () => {
  const { list } = parseHistoryMessages([
    { role: 'user', fragments: [{ type: 'REQUEST', content: 'hi' }] },
    {
      role: 'assistant',
      fragments: [{ type: 'RESPONSE', content: 'hello' }],
    },
  ])
  assert.deepEqual(list, [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'hello' },
  ])
})

// A SYSTEM / TOOL turn belongs to neither side of the dialogue: printing it as
// the operator's message put words the operator never wrote into the restored
// history.
test('parseHistoryMessages drops SYSTEM and TOOL turns', () => {
  const { list } = parseHistoryMessages([
    { role: 'SYSTEM', fragments: [{ type: 'REQUEST', content: 'sys' }] },
    { role: 'TOOL', fragments: [{ type: 'REQUEST', content: 'tool' }] },
    { role: 'USER', fragments: [{ type: 'REQUEST', content: 'real' }] },
  ])
  assert.deepEqual(list, [{ role: 'user', text: 'real' }])
})
