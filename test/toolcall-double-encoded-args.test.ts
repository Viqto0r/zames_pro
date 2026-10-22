import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseToolCall } from '../src/answer-parse.ts'

// A model sometimes emits `args` as a JSON STRING instead of an object
// (`{"tool":"Read","args":"{\"path\":\"a.ts\"}"}`). The strict parser
// requires an OBJECT, so the call was NOT recognized - and the retry-guard
// re-asked the model or the run ended with the JSON as the final answer. The
// args string is valid JSON of an object, so it must be unwrapped.
test('args given as a JSON string are unwrapped', () => {
  const call = parseToolCall('{"tool":"Read","args":"{\\"path\\":\\"a.ts\\"}"}')
  assert.deepEqual(call, { tool: 'Read', args: { path: 'a.ts' } })
})

test('a plain object args is unchanged', () => {
  assert.deepEqual(parseToolCall('{"tool":"Read","args":{"path":"a.ts"}}'), {
    tool: 'Read',
    args: { path: 'a.ts' },
  })
})
