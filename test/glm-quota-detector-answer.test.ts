import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isQuotaExhaustedText } from '../src/glm-net-capture.ts'

const NL = String.fromCharCode(10)

// Every OTHER z.ai classifier (rate limit, busy, guest limit, captcha, context
// limit) first checks `ERROR_PAYLOAD_RE` / the answer content, so a model answer
// that merely MENTIONS the phrase is not treated as a refusal. `isQuotaExhaustedText`
// skipped that guard: it is a bare regex over the RAW body. A normal answer
// explaining `insufficient_quota` / "exceeded your current quota" (e.g. the
// operator asked how to handle that API error) made ask() throw
// `glm.quota_exhausted` and ABANDON a perfectly good turn.
test('an answer that mentions the quota phrase is not a quota error', () => {
  const body =
    'data: ' +
    JSON.stringify({
      type: 'chat:completion',
      data: {
        phase: 'answer',
        delta_content:
          'When the API returns insufficient_quota, catch it and report the exceeded your current quota message.',
      },
    }) +
    NL
  assert.equal(isQuotaExhaustedText(body), false)
})

test('a real quota error payload is still recognised', () => {
  const body = JSON.stringify({
    type: 'error',
    error: { code: 'insufficient_quota', message: 'quota exceeded' },
  })
  assert.equal(isQuotaExhaustedText(body), true)
})
