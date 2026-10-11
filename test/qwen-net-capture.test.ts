import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAnswer,
  extractTokenUsage,
  isFinishedWithoutAnswer,
  isRateLimitText,
  isGuestLimitText,
  isServerBusyText,
} from '../src/qwen-net-capture.ts'

// A real Qwen completions stream: a thinking_summary phase with NO answer
// content, then the answer phase chunks, then a finished chunk. The reasoning
// must never leak into the extracted answer.
const SSE = [
  'data: {"response.created":{"chat_id":"2a2355b7-90b7-49b2-9c78-a7f59a44ea84","response_id":"r1"}}',
  '',
  'data: {"choices":[{"delta":{"role":"assistant","content":"","phase":"thinking_summary","extra":{"summary_thought":{"content":["I must output exactly the token."]}}},"status":"typing"}],"usage":{"input_tokens":560,"output_tokens":57,"total_tokens":617}}',
  '',
  'data: {"choices":[{"delta":{"role":"assistant","content":"QWEN","phase":"answer","status":"typing"}}],"usage":{"input_tokens":560,"output_tokens":192,"total_tokens":758}}',
  '',
  'data: {"choices":[{"delta":{"role":"assistant","content":"-OK-1","phase":"answer","status":"typing"}}],"usage":{"input_tokens":560,"output_tokens":192,"total_tokens":758}}',
  '',
  'data: {"choices":[{"delta":{"content":"","role":"assistant","status":"finished","phase":"answer"}}]}',
  '',
].join('\n')

test('extractAnswer: reasoning is skipped, answer chunks concatenated', () => {
  assert.equal(extractAnswer(SSE), 'QWEN-OK-1')
})

test('extractTokenUsage: prefers input_tokens (prompt/context size)', () => {
  // The status counter means "how much context is used" -> the PROMPT size
  // (input_tokens), not total_tokens (which adds the answer length).
  assert.equal(extractTokenUsage(SSE), 560)
})

test('isFinishedWithoutAnswer: false when an answer was produced', () => {
  assert.equal(isFinishedWithoutAnswer(SSE), false)
})

// A turn that finished with ONLY a thinking_summary and no answer: the agent
// must retry instead of waiting out the timeout (mirrors DeepSeek case).
const NO_ANSWER = [
  'data: {"choices":[{"delta":{"role":"assistant","content":"","phase":"thinking_summary"},"status":"typing"}]}',
  '',
  'data: {"choices":[{"delta":{"content":"","role":"assistant","status":"finished","phase":"answer"}}]}',
  '',
].join('\n')

test('isFinishedWithoutAnswer: true for a finished turn with no answer', () => {
  assert.equal(extractAnswer(NO_ANSWER), '')
  assert.equal(isFinishedWithoutAnswer(NO_ANSWER), true)
})

test('isRateLimitText matches the server notice', () => {
  assert.equal(isRateLimitText('{"error":"too many requests"}'), true)
  assert.equal(isRateLimitText('all good'), false)
})

// The real guest-limit body contains an apostrophe; the matcher keys on the
// phrase "guest chat limit", so a simplified body is enough here.
test('isGuestLimitText detects the guest daily limit (not a transient limit)', () => {
  const body =
    '{"success":false,"data":{"code":"RateLimited","details":"reached the guest chat limit for today usage. Log in to continue."}}'
  assert.equal(isGuestLimitText(body), true)
  // A plain transient rate limit must NOT be mistaken for the guest limit.
  assert.equal(isGuestLimitText('{"error":"too many requests"}'), false)
})

// The server-busy notice is a SEPARATE retryable family from the rate limit:
// the caller backs off for `serverBusyWaitMs` instead of `rateLimitWaitMs`.
// QwenBrowser._onResponse must flag it (it was previously never imported, so a
// busy server burned the whole attempt budget waiting out the deadline).
test('isServerBusyText detects the busy / unavailable notices', () => {
  assert.equal(isServerBusyText('{"error":"server is busy"}'), true)
  assert.equal(isServerBusyText('Service unavailable'), true)
  assert.equal(isServerBusyText('please try again later'), true)
  assert.equal(isServerBusyText('a normal answer body'), false)
})
