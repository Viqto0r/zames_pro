import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyLoginProbe } from '../src/browser-login.ts'

// classifyLoginProbe() turns the cheap page signals into a login verdict. A
// CAPTCHA is the strongest "the site wants a HUMAN" signal, and the whole
// point of the visible-window flow is that a captcha cannot be typed in a
// terminal. The `guest` role check used to run BEFORE the captcha check, so a
// guest page that rendered a captcha was classified as `in` (no sign-in
// control visible) or `out` — never `challenge` — and the window flow was not
// started; the run then died on the age gate / refused send.

test('a guest page with a captcha is a CHALLENGE, not a session', () => {
  assert.equal(
    classifyLoginProbe({ role: 'guest', captcha: true }),
    'challenge',
  )
  assert.equal(
    classifyLoginProbe({ role: 'guest', captcha: true, signInVisible: true }),
    'challenge',
  )
})

test('a captcha without a role is still a challenge', () => {
  assert.equal(classifyLoginProbe({ captcha: true }), 'challenge')
  assert.equal(
    classifyLoginProbe({ captcha: true, hasToken: true }),
    'challenge',
  )
})

test('a real signed-in role still wins over a stale captcha node', () => {
  assert.equal(classifyLoginProbe({ role: 'user', captcha: true }), 'in')
  assert.equal(classifyLoginProbe({ role: 'admin', captcha: true }), 'in')
})

test('a guest without a captcha keeps the guest verdict', () => {
  assert.equal(classifyLoginProbe({ role: 'guest' }), 'in')
  assert.equal(
    classifyLoginProbe({ role: 'guest', signInVisible: true }),
    'out',
  )
})
