import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCaptchaText } from '../src/glm-net-capture.ts'

// isCaptchaText runs on EVERY z.ai response body, INCLUDING the answer SSE
// stream, and its match throws GlmCaptchaError ("sign in in the browser
// window") for the whole turn. A normal ANSWER that merely MENTIONS the
// captcha (e.g. the model explaining how to pass the slider) therefore killed
// the turn. The classifier must ignore a body whose chunks carry answer text.
function answerSse(content: string): string {
  return (
    'data: {"type":"chat:completion","data":{"phase":"answer","delta_content":' +
    JSON.stringify(content) +
    '}}'
  )
}

test('a normal answer that mentions the captcha is not a captcha', () => {
  assert.equal(
    isCaptchaText(
      answerSse('To pass the security verification, drag the slider'),
    ),
    false,
  )
})

test('a real captcha page is still detected', () => {
  const html =
    '<html><body>Please complete security verification</body>' +
    '<div>Please drag the slider to complete the puzzle</div></html>'
  assert.equal(isCaptchaText(html), true)
  assert.equal(isCaptchaText('{"CertifyId":"x"}'), true)
})
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
