import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRestoredMessage } from '../src/commands.ts'

// A `respond` call whose message TEXT ends with a closing safety marker
// (`</ds_safety>`) is unwrapped to that message and shown - the `/resume`
// dialogue then prints the model's internal marker as if it were the answer.
// The plain-text path already drops a message carrying `</ds_safety>`.
test('a respond message with a safety tail is not printed', () => {
  const text =
    '{"tool":"respond","args":{"message":"final answer</ds_safety>"}}'
  const out = normalizeRestoredMessage({ role: 'assistant', text } as never)
  assert.equal(out, null)
})

test('a normal respond message is still shown', () => {
  const text = '{"tool":"respond","args":{"message":"all done"}}'
  assert.deepEqual(
    normalizeRestoredMessage({ role: 'assistant', text } as never),
    {
      role: 'assistant',
      text: 'all done',
    },
  )
})
