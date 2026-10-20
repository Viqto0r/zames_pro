import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  extractAnswer,
  extractTokenUsage,
  isFinishedWithoutAnswer,
  isRateLimitText,
  isServerBusyText,
  isGuestLimitText,
  isCaptchaText,
  extractChatId,
} from '../src/glm-net-capture.ts'

// Every fixture in test/fixtures/glm is a REAL (anonymized) capture from a
// live z.ai session, so these tests pin the parser to the protocol z.ai
// actually speaks, not to a shape invented for the test.
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'glm',
)
const fixture = (name: string): string =>
  fs.readFileSync(path.join(dir, name), 'utf-8')

test('extractAnswer returns only the answer phase, never the reasoning', () => {
  const body = fixture('answer-simple.sse')
  assert.equal(extractAnswer(body), 'PONG')
  assert.ok(!/The user wants/.test(extractAnswer(body)))
})

test('extractAnswer skips z.ai tool_call and tool_response phases', () => {
  const body = fixture('answer-toolcall.sse')
  const ans = extractAnswer(body)
  assert.ok(ans.includes('The command executed.'))
  assert.ok(!ans.includes('delta_name'))
  assert.ok(!ans.includes('GLMTOOL'))
})

test('extractTokenUsage reads usage.prompt_tokens', () => {
  assert.equal(extractTokenUsage(fixture('answer-simple.sse')), 21683)
})

test('isFinishedWithoutAnswer: a done chunk with no answer', () => {
  assert.equal(isFinishedWithoutAnswer(fixture('finished-no-answer.sse')), true)
  assert.equal(isFinishedWithoutAnswer(fixture('answer-simple.sse')), false)
})

test('classifiers fire on the error payloads', () => {
  assert.equal(isRateLimitText(fixture('error-rate-limit.sse')), true)
  assert.equal(isServerBusyText(fixture('error-server-busy.sse')), true)
})

test('a normal answer that MENTIONS a limit does not trigger the classifiers', () => {
  const body = fixture('answer-mentions-limit.sse')
  assert.equal(isRateLimitText(body), false)
  assert.equal(isServerBusyText(body), false)
  assert.equal(isGuestLimitText(body), false)
})

test('isCaptchaText detects the Aliyun slider page', () => {
  const html =
    '<html><body>Please complete security verification</body>' +
    '<div>Please drag the slider to complete the puzzle</div></html>'
  assert.equal(isCaptchaText(html), true)
  assert.equal(isCaptchaText(fixture('answer-simple.sse')), false)
})

test('extractChatId reads the id from a create-chat response', () => {
  const body = JSON.stringify({
    id: '0e651f21-d9a3-4120-b700-98f423da8af7',
    title: 'New Chat',
  })
  assert.equal(extractChatId(body), '0e651f21-d9a3-4120-b700-98f423da8af7')
  assert.equal(extractChatId('no id here'), null)
})

test('an empty body is not an answer and not an error', () => {
  assert.equal(extractAnswer(''), '')
  assert.equal(isRateLimitText(''), false)
  assert.equal(isFinishedWithoutAnswer(''), false)
})
