import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DeepSeekBrowser } from '../src/browser.ts'

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
