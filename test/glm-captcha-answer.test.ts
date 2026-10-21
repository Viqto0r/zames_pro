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
