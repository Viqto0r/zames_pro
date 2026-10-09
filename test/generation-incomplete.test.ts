import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DeepSeekBrowser,
  GenerationIncompleteError,
  isGenerationIncompleteText,
} from '../src/browser.ts'
import { extractAnswer } from '../src/net-capture.ts'

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

// REGRESSION (live): DeepSeek sends the status in the JSON-PROPERTY form
// (`"quasi_status":"..."`) in the initial message, not only as a BATCH
// update. The detector used to match ONLY `"quasi_status","v":"..."`, so a
// turn that ended with the property form was not recognized — the agent hung
// until the timeout (the operator saw a rendered "Server is temporarily
// unavailable." message with no reaction). Match both shapes.
test('the JSON-property form of quasi_status is detected', () => {
  const finProp =
    'data: {"v":{"response":{"status":"WIP","fragments":[],"quasi_status":"FINISHED"}}}'
  const incProp =
    'data: {"v":{"response":{"status":"WIP","fragments":[],"quasi_status":"INCOMPLETE"}}}'
  // INCOMPLETE in the property form is a truncated turn.
  assert.equal(isGenerationIncompleteText(incProp), true)
  // FINISHED in the property form is NOT "incomplete" by itself...
  assert.equal(isGenerationIncompleteText(finProp), false)
  // ...but it IS a "finished without answer" when there is no RESPONSE.
  assert.equal(isFinishedWithoutAnswer(finProp), true)
  // The BATCH form still works.
  assert.equal(isFinishedWithoutAnswer(FINISHED_THINK_ONLY), true)
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

// REGRESSION (live hang): a truncated body (generation_err / INCOMPLETE) has
// NO RESPONSE fragment, so extractAnswer() returns '' and `_netCapture` stays
// empty. The incomplete check guarded on `this._netCapture &&` therefore NEVER
// fired — the agent hung on "Stopped" until the timeout. The detectors must be
// callable on the RAW body even when there is no answer text.

test('a truncated body has no answer text but IS detected as truncated', () => {
  const body = [
    'data: {"v":{"response":{"status":"WIP","thinking_enabled":true,"fragments":[{"type":"THINK","content":"Let"}]}}}',
    'data: {"v":" me think"}',
    'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"INCOMPLETE"}]}',
    'data: {"p":"response/status","o":"SET","v":"INCOMPLETE"}',
    'event: hint',
    'data: {"type":"error","content":"Server is temporarily unavailable.","clear_response":false,"finish_reason":"generation_err"}',
  ].join('\n')
  // No RESPONSE fragment -> extractAnswer is empty (this is why the old
  // `_netCapture &&` guard was dead code).
  assert.equal(extractAnswer(body), '')
  // But the raw body must still be recognized as a truncated turn.
  assert.equal(isGenerationIncompleteText(body), true)
})
