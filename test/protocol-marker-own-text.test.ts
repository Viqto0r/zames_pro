import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FINISHED_STATUS_RE,
  INCOMPLETE_STATUS_RE,
  GENERATION_ERR_RE,
} from '../src/deepseek-ui.ts'

// MEASURED live (long-chain smoke, 2026-10-30): the captured body carried the
// model's OWN tool call quoting this very source (`/^(?:data: ?|\\{)[^\\n]*?`),
// and the marker regex matched the quote: a COMPLETE turn was reported as
// truncated, the loop clicked Continue and resent it. Inside a JSON string the
// quotes are ESCAPED (`\"`), and the anchor must stop at the first REAL quote
// of the line — i.e. it may not cross an escaped one.
test('a quoted marker inside our own text is not a protocol marker', () => {
  const quoted =
    'data: ' +
    JSON.stringify({
      v: 'src/deepseek-ui.ts: /^(?:data: ?|\\{)[^\\n]*?"quasi_status"',
    })
  assert.equal(FINISHED_STATUS_RE.test(quoted), false)
  assert.equal(INCOMPLETE_STATUS_RE.test(quoted), false)
  assert.equal(
    GENERATION_ERR_RE.test(
      'data: ' + JSON.stringify({ v: '"finish_reason":"generation_err"' }),
    ),
    false,
  )
})

test('the REAL BATCH line still matches every marker', () => {
  const NL = String.fromCharCode(10)
  const batch = (v: string) =>
    'data: ' +
    JSON.stringify({ p: 'response', o: 'BATCH', v: [{ p: 'quasi_status', v }] })
  assert.equal(FINISHED_STATUS_RE.test(batch('FINISHED')), true)
  assert.equal(INCOMPLETE_STATUS_RE.test(batch('INCOMPLETE')), true)
  assert.equal(
    GENERATION_ERR_RE.test('data: {"finish_reason":"generation_err"}'),
    true,
  )
  assert.equal(NL.length, 1)
})
