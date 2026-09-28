import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DeepSeekBrowser,
  GenerationIncompleteError,
  isGenerationIncompleteText,
} from '../src/browser.ts'

// Regression for "the send stops and a Continue button appears" when the
// DeepSeek "Deep thinking" (reasoning) toggle is ON.
//
// With reasoning on, the server frequently truncates the turn: the SSE stream
// ends with `quasi_status: INCOMPLETE` and
// `finish_reason: generation_err` ("Server is temporarily unavailable"), and
// the web UI offers a "Continue" button. The DOM keeps the partial answer
// (often the previous one), so the finish loop in _askOnce waited out the
// whole timeout and threw ds.send_no_new_answer — the agent looked stopped
// while the chat showed Continue.
//
// The fix detects the truncated turn from the raw network body and retries the
// send (what the Continue button does) instead of hanging.

const ERR_BODY = [
  'data: {"v":{"response":{"status":"WIP","thinking_enabled":true,' +
    '"fragments":[{"type":"THINK","content":"Let"}]}}}',
  'data: {"p":"response","o":"BATCH","v":[{"p":"accumulated_token_usage","v":17127},{"p":"quasi_status","v":"INCOMPLETE"}]}',
  'data: {"p":"response/status","o":"SET","v":"INCOMPLETE"}',
  'event: hint',
  'data: {"type":"error","content":"Server is temporarily unavailable.","clear_response":false,"finish_reason":"generation_err"}',
  'event: close',
  'data: {"click_behavior":"none","auto_resume":false}',
].join('\n')

const OK_BODY = [
  'data: {"v":{"response":{"status":"WIP","fragments":[{"type":"RESPONSE","content":"{\\"tool\\": \\"Read\\"}"}]}}}',
  'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
  'data: {"p":"response/status","o":"SET","v":"FINISHED"}',
  'event: close',
].join('\n')

test('generation_err / INCOMPLETE body is recognized as truncated', () => {
  assert.equal(isGenerationIncompleteText(ERR_BODY), true)
})

test('a normally finished answer is not truncated', () => {
  assert.equal(isGenerationIncompleteText(OK_BODY), false)
  assert.equal(isGenerationIncompleteText(''), false)
})

test('GenerationIncompleteError is its own error type', () => {
  const e = new GenerationIncompleteError('x')
  assert.equal(e.name, 'GenerationIncompleteError')
  assert.ok(e instanceof Error)
})

test('DeepSeekBrowser honors maxIncompleteRetries/incompleteWaitMs', () => {
  const b = new DeepSeekBrowser({
    maxIncompleteRetries: 7,
    incompleteWaitMs: 123,
  })
  assert.equal(b.maxIncompleteRetries, 7)
  assert.equal(b.incompleteWaitMs, 123)
})
