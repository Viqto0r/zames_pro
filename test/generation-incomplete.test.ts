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

// A FINISHED turn that produced NO answer text (only reasoning) is the real
// "Stopped + Continue" case: quasi_status is FINISHED, so the generation_err
// detector does not see it, extractAnswer() returns '', and the old finish
// loop waited out the whole timeout — the operator saw the agent hang on
// "Stopped" with a Continue button.
import { isFinishedWithoutAnswer } from '../src/net-capture.ts'

const FINISHED_THINK_ONLY = [
  'data: {"v":{"response":{"status":"WIP","thinking_enabled":true,"fragments":[{"type":"THINK","content":"Let me think..."}]}}}',
  'data: {"v":" more reasoning"}',
  'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
  'data: {"p":"response/status","o":"SET","v":"FINISHED"}',
].join('\n')

const FINISHED_WITH_RESPONSE = [
  'data: {"v":{"response":{"status":"WIP","fragments":[{"type":"THINK","content":"reasoning"}]}}}',
  'data: {"p":"response/fragments","o":"APPEND","v":[{"type":"RESPONSE","content":"{\\"tool\\": \\"Read\\"}"}]}',
  'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
].join('\n')

test('a FINISHED turn with only reasoning has no answer', () => {
  assert.equal(isFinishedWithoutAnswer(FINISHED_THINK_ONLY), true)
})

test('a FINISHED turn with a RESPONSE fragment is a real answer', () => {
  assert.equal(isFinishedWithoutAnswer(FINISHED_WITH_RESPONSE), false)
})

test('an unfinished (INCOMPLETE) body is not "finished without answer"', () => {
  assert.equal(
    isFinishedWithoutAnswer(
      'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"INCOMPLETE"}]}',
    ),
    false,
  )
  assert.equal(isFinishedWithoutAnswer(''), false)
})
