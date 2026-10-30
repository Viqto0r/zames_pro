// normalizeRestoredMessage() drops protocol noise from the restored dialogue.
// Its `DSML` guard matches the bare word ANYWHERE in the text — the very bug
// already fixed in the /compact summary validator: a real answer that merely
// MENTIONS the feature ("I fixed the DSML parser in xml-toolcall.ts") is
// dropped from /resume, so the operator sees a dialogue where the agent's
// reply is missing. Only a real DSML MARKER is noise.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRestoredMessage } from '../src/restore-history.ts'

test('an answer that mentions DSML as prose is kept', () => {
  const r = normalizeRestoredMessage({
    role: 'assistant',
    text: 'I fixed the DSML parser in xml-toolcall.ts.',
  })
  assert.ok(r, 'the answer was dropped')
  assert.equal(r.text, 'I fixed the DSML parser in xml-toolcall.ts.')
})

test('a real DSML tool call is still dropped', () => {
  const r = normalizeRestoredMessage({
    role: 'assistant',
    text: '<｜DSML｜invoke name="Read"><｜DSML｜parameter name="path">a</｜DSML｜parameter></｜DSML｜invoke>',
  })
  assert.equal(r, null)
})

test('a plain answer is unchanged', () => {
  const r = normalizeRestoredMessage({ role: 'assistant', text: 'done' })
  assert.equal(r?.text, 'done')
})
