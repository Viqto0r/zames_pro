import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRateLimitText, isServerBusyText } from '../src/browser.ts'

// The finish-loop in _askOnce reads the toast on every tick and classifies
// the rate limit and the server-busy condition INDEPENDENTLY. The old code
// nested the server-busy check after a `throw` (dead code), and read the
// toasts only once per 5 ticks, so a toast that appeared and vanished between
// checks was missed — the run waited out the whole deadline and threw
// ds.send_no_new_answer (the "agent hung after a rate limit" symptom).

test('rate limit and server busy are classified independently', () => {
  assert.equal(isRateLimitText('Messages too frequent. Try again later.'), true)
  assert.equal(isRateLimitText('Слишком часто. Повторите позже.'), true)
  assert.equal(isServerBusyText('Server busy. Try again later.'), true)
  // A rate-limit text must NOT be classified as server-busy (the long wait
  // is the correct response), and vice versa.
  assert.equal(
    isServerBusyText('Messages too frequent. Try again later.'),
    false,
  )
  assert.equal(isRateLimitText('Server busy. Try again later.'), false)
})

test('a plain answer is neither a rate limit nor a server hiccup', () => {
  assert.equal(isRateLimitText('Here is the file you asked for.'), false)
  assert.equal(isServerBusyText('Here is the file you asked for.'), false)
})
