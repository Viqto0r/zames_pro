// parseAssistantToolCall() unwraps an assistant `respond` call so the restored
// dialogue shows the operator-facing text. The message is extracted with a
// regex that assumes a QUOTED value; for a non-string `message` (a number, a
// boolean, an array — a malformed/hand-written history payload) the greedy
// match fails and the fallback slices the RAW TEXT from the key: the restored
// turn prints `:42}}` / `:[1,2]}}` — protocol noise shown to the operator as
// the model's answer instead of being dropped.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAssistantToolCall } from '../src/restore-history.ts'

test('a non-string respond message is not returned as raw protocol text', () => {
  for (const raw of [
    '{"tool":"respond","args":{"message":42}}',
    '{"tool":"respond","args":{"message":true}}',
    '{"tool":"respond","args":{"message":[1,2]}}',
    '{"tool":"respond","args":{"message":null}}',
  ]) {
    const r = parseAssistantToolCall(raw)
    assert.equal(r?.tool, 'respond')
    assert.equal(
      r?.message,
      '',
      'got ' + JSON.stringify(r?.message) + ' for ' + raw,
    )
  }
})

test('a normal quoted respond message still round-trips', () => {
  const r = parseAssistantToolCall(
    '{"tool":"respond","args":{"message":"done, all tests pass"}}',
  )
  assert.equal(r?.message, 'done, all tests pass')
})
