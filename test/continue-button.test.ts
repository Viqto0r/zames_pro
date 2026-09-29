import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser, CONTINUE_NAME_RE } from '../src/browser.ts'

// With the reasoning ("Deep thinking") toggle on, DeepSeek caps the THINK
// phase and shows a "Continue" button. The model does not resume by itself,
// so the agent must click it — otherwise the turn sat idle until the operator
// pressed Continue by hand (exactly the reported symptom).
//
// _clickContinueIfVisible evaluates a function in the page that searches
// CONTINUE_SELECTORS and clicks the first element whose label is EXACTLY
// continue/продолжить/продолжение. Here we drive it with a fake page that
// simulates the DOM scan: the returned value tells us whether a click ran.

function fakePage(clicked: boolean): unknown {
  return {
    async evaluate(_fn: unknown, _arg: unknown) {
      return clicked
    },
  }
}

test('_clickContinueIfVisible returns true when the page clicks Continue', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = fakePage(true)
  assert.equal(await b._clickContinueIfVisible(), true)
})

test('_clickContinueIfVisible returns false when no button is present', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = fakePage(false)
  assert.equal(await b._clickContinueIfVisible(), false)
})

test('_clickContinueIfVisible survives a page error (never throws)', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = {
    async evaluate() {
      throw new Error('page gone')
    },
  }
  assert.equal(await b._clickContinueIfVisible(), false)
})

test('autoContinue defaults to true and can be turned off', () => {
  assert.equal(new DeepSeekBrowser().autoContinue, true)
  assert.equal(new DeepSeekBrowser({ autoContinue: false }).autoContinue, false)
})

// The reasoning Continue button appears IMMEDIATELY when the THINK phase is
// capped, so waiting out the full send interval (15s) before clicking made
// every resume feel sluggish. A dedicated, much smaller gap applies to
// Continue clicks (still >0 so `chat/continue` is not hammered).
test('continueMinGapMs defaults small and is configurable', () => {
  assert.equal(new DeepSeekBrowser().continueMinGapMs, 1500)
  assert.equal(
    new DeepSeekBrowser({ continueMinGapMs: 300 }).continueMinGapMs,
    300,
  )
  // It must be smaller than the regular send interval — that is the point.
  assert.ok(new DeepSeekBrowser().continueMinGapMs < 15000)
})

test('_continueButtonVisible returns the page decision', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = fakePage(true)
  assert.equal(await b._continueButtonVisible(), true)
  const b2 = new DeepSeekBrowser()
  ;(b2 as unknown as { page: unknown }).page = fakePage(false)
  assert.equal(await b2._continueButtonVisible(), false)
})

test('_continueButtonVisible survives a page error', async () => {
  const b = new DeepSeekBrowser()
  ;(b as unknown as { page: unknown }).page = {
    async evaluate() {
      throw new Error('page gone')
    },
  }
  assert.equal(await b._continueButtonVisible(), false)
})

// The finish loop must NOT accept a "settled" answer while Continue is on
// screen: a paused generation also looks settled (the text stops changing),
// and returning there is exactly the "agent stopped with a Continue button"
// bug. This documents the rule the loop implements (see _askOnce):
//   paused (Continue visible)  -> click + keep waiting, never return
//   not paused + stable        -> return the answer
test('a settled answer must not be accepted while Continue is visible', () => {
  const decide = (continueVisible: boolean, stable: boolean): string => {
    if (continueVisible) return 'wait'
    return stable ? 'return' : 'wait'
  }
  assert.equal(decide(true, true), 'wait')
  assert.equal(decide(false, true), 'return')
  assert.equal(decide(false, false), 'wait')
})

// The effective send interval is base + extra when Deep thinking is ON.
// Reasoning turns add extra requests (chat/continue clicks, truncation
// retries), so a small margin reduces the rate-limit risk.
test('sendIntervalMs adds thinkingExtraMs only in thinking mode', () => {
  const b = new DeepSeekBrowser({
    minSendIntervalMs: 15000,
    thinkingExtraMs: 2000,
    deepThinking: false,
  })
  assert.equal(b.sendIntervalMs(), 15000)
  const t = new DeepSeekBrowser({
    minSendIntervalMs: 15000,
    thinkingExtraMs: 2000,
    deepThinking: true,
  })
  assert.equal(t.sendIntervalMs(), 17000)
})

// In reasoning mode DeepSeek labels the button «Продолжить размышление» /
// «Continue thinking», not a bare «Continue». The old EXACT list missed that
// label, so the operator had to press the button by hand. The matcher must
// accept the reasoning suffix, but still reject a "Continue" that is only part
// of a longer rendered prose (a naive non-exact getByRole would click it).
test('CONTINUE_NAME_RE matches the plain and reasoning Continue labels', () => {
  for (const label of [
    'Continue',
    'Continue.',
    'Продолжить',
    'Продолжение',
    'Continue thinking',
    'Continue reasoning',
    'Продолжить размышление',
    'Продолжить размышления',
    'Продолжить генерацию',
  ]) {
    assert.equal(CONTINUE_NAME_RE.test(label), true, label)
  }
})

test('CONTINUE_NAME_RE rejects prose and unrelated labels', () => {
  for (const label of [
    'Continue with the previous conversation about pancakes',
    'Continue reading the file',
    'Продолжить работу над задачей',
    'Stop',
    'Отмена',
    '',
  ]) {
    assert.equal(CONTINUE_NAME_RE.test(label), false, label)
  }
})
