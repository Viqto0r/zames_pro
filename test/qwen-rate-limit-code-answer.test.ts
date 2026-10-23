import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRateLimitText } from '../src/qwen-net-capture.ts'

const NL = String.fromCharCode(10)

// `isRateLimitText` first checks for the `quota_limit` CODE — but that check
// runs before the answer-content guard, so a normal ANSWER that MENTIONS
// `quota_limit` (the operator asked how to handle that API error) was taken
// for a rate limit: ask() backed off and re-sent a good turn. Every other
// phrase in the same classifier is guarded by `hasAnswerContent`, and the
// `quota_limit` CODE only means something in an ERROR payload.
test('an answer mentioning quota_limit is not a rate limit', () => {
  const body =
    'data: ' +
    JSON.stringify({
      choices: [
        {
          delta: {
            phase: 'answer',
            content:
              'When the API answers quota_limit you should back off; please try again later.',
          },
        },
      ],
    }) +
    NL
  assert.equal(isRateLimitText(body), false)
})

test('a real quota_limit error is still a rate limit', () => {
  const body = JSON.stringify({
    type: 'error',
    error: { code: 'quota_limit', message: 'high demand' },
  })
  assert.equal(isRateLimitText(body), true)
})
