import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  probeUiHealth,
  UI_CAPABILITIES,
  type UiProbePage,
} from '../src/ui-health.ts'

// The DeepSeek UI health probe (step 3 of the "universal selectors" work).
// It must report the ALWAYS-present capabilities (input/send/toggles/newChat)
// so a DeepSeek redesign surfaces as a clear warning BEFORE a task hangs, and
// it must NEVER throw on a dead page.

function pageWith(presentSelectors: string[], textSel?: string): UiProbePage {
  return {
    async count(sel: string) {
      // Match when the selector is in the present list, or when any of the
      // chain's selectors is present (chains are OR-ed).
      return presentSelectors.some((p) => sel === p) ? 1 : 0
    },
    async countByText(sel: string, _textRe: RegExp) {
      return textSel && sel === textSel ? 1 : 0
    },
  }
}

test('probeUiHealth: a healthy page has every capability present', async () => {
  const all = UI_CAPABILITIES.flatMap((c) => c.selectors)
  const res = await probeUiHealth(
    pageWith(all, 'button, a, [role="button"], div, span'),
  )
  assert.equal(res.ok, true)
  assert.deepEqual(res.missing, [])
  assert.deepEqual(res.missingCritical, [])
  assert.deepEqual(res.present.sort(), ['input', 'newChat', 'send', 'toggles'])
})

test('probeUiHealth: a missing input is a CRITICAL failure', async () => {
  // Everything except the input selector chain.
  const withoutInput = UI_CAPABILITIES.filter((c) => c.capability !== 'input')
  const sels = withoutInput.flatMap((c) => c.selectors)
  const res = await probeUiHealth(
    pageWith(sels, 'button, a, [role="button"], div, span'),
  )
  assert.equal(res.ok, false)
  assert.deepEqual(res.missingCritical, ['input'])
  assert.ok(res.missing.includes('input'))
})

test('probeUiHealth: a missing toggle is advisory, not critical', async () => {
  const withoutToggles = UI_CAPABILITIES.filter(
    (c) => c.capability !== 'toggles',
  )
  const sels = withoutToggles.flatMap((c) => c.selectors)
  const res = await probeUiHealth(
    pageWith(sels, 'button, a, [role="button"], div, span'),
  )
  assert.equal(res.ok, true)
  assert.deepEqual(res.missing, ['toggles'])
  assert.deepEqual(res.missingCritical, [])
})

test('probeUiHealth: a dead page reports everything missing, never throws', async () => {
  const dead: UiProbePage = {
    async count() {
      throw new Error('page closed')
    },
    async countByText() {
      throw new Error('page closed')
    },
  }
  const res = await probeUiHealth(dead)
  assert.equal(res.ok, false)
  assert.deepEqual(res.missing.sort(), ['input', 'newChat', 'send', 'toggles'])
  assert.deepEqual(res.missingCritical.sort(), ['input', 'send'])
})

test('probeUiHealth: input/send are the only critical capabilities', () => {
  const critical = UI_CAPABILITIES.filter((c) => c.critical).map(
    (c) => c.capability,
  )
  assert.deepEqual(critical.sort(), ['input', 'send'])
})
