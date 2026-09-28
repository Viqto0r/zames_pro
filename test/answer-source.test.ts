import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

// Regression for the "the agent stopped after a tool call" flapping.
//
// The "new answer started?" checks in _askOnce used to compare the network
// capture against itself: _readLastAnswerText() prefers the capture when it
// is fresh, and beforeText was taken through it. After a send the capture
// (the SAME text) made cur equal to beforeText, so the "changed" signal
// never fired, ask() ended with "no new answer" and retried for minutes —
// the operator saw the agent stop right after a tool call.
//
// The fix: a DOM-only reader. It must NEVER return the network capture,
// otherwise the self-comparison comes back.

function fakePage(domText: string): unknown {
  return {
    async evaluate(_fn: unknown, _arg: unknown) {
      return domText
    },
  }
}

test('_readLastAnswerTextDom ignores the network capture', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = fakePage('OLD BODY')
  // A "fresh" network capture (looks like the current answer).
  const raw = b as unknown as { _netCapture: string; _netCaptureAt: number }
  raw._netCapture = 'NEW BODY'
  raw._netCaptureAt = Date.now()
  b._lastSentAt = 0

  // The DOM reader must still see the OLD text (not the capture).
  const dom = await b._readLastAnswerTextDom()
  assert.equal(dom, 'OLD BODY')

  // The generic reader prefers the capture (existing contract).
  const gen = await b._readLastAnswerText()
  assert.equal(gen, 'NEW BODY')
})

test('_readLastAnswerTextCleanDom also ignores the capture', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = fakePage('DOMANSWER')
  const raw = b as unknown as { _netCapture: string; _netCaptureAt: number }
  raw._netCapture = 'CAPTURE'
  raw._netCaptureAt = Date.now()
  b._lastSentAt = 0

  const clean = await b._readLastAnswerTextCleanDom()
  assert.equal(clean, 'DOMANSWER')
})
