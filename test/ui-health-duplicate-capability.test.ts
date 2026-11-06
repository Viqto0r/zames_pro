import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probeUiHealth } from '../src/ui-health.ts'

// A provider's capability list may list the SAME capability twice (a merge of
// two selector chains, a copy-paste). The result arrays then carry a DUPLICATE
// entry, and the `/doctor` row prints `input, input` — a misleading report.
// A capability is reported once per result.
const page = {
  async count() {
    return 0
  },
  async countByText() {
    return 0
  },
}

test('a capability listed twice is reported once', async () => {
  const r = await probeUiHealth(
    page as never,
    [
      { capability: 'input', selectors: ['a'], critical: true },
      { capability: 'input', selectors: ['b'], critical: true },
    ] as never,
  )
  assert.deepEqual(r.missing, ['input'])
  assert.deepEqual(r.missingCritical, ['input'])
})
