// probeUiHealth() checks the ALWAYS-present controls of a provider's page. A
// capability whose selector list is EMPTY cannot be probed at all: z.ai has no
// toggles, so GLM passes `{ capability: 'toggles', selectors: [] }`. The probe
// reported it as MISSING, and the startup/doctor warning then said «UI: not
// found (toggles) — some features may not work» on every healthy z.ai page — a
// false alarm about a control that does not exist on that site.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probeUiHealth } from '../src/ui-health.ts'

test('a capability with no selectors is not reported missing', () => {
  const page = {
    count: async () => 1,
    countByText: async () => 1,
  }
  return probeUiHealth(page as never, [
    { capability: 'input', selectors: ['#i'], critical: true },
    { capability: 'toggles', selectors: [], critical: false },
  ]).then((r) => {
    assert.equal(r.missing.includes('toggles'), false, JSON.stringify(r))
    assert.equal(r.ok, true)
  })
})

test('a real missing control is still reported', () => {
  const page = { count: async () => 0, countByText: async () => 0 }
  return probeUiHealth(page as never, [
    { capability: 'input', selectors: ['#i'], critical: true },
  ]).then((r) => {
    assert.deepEqual(r.missing, ['input'])
    assert.deepEqual(r.missingCritical, ['input'])
  })
})
