import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GlmBrowser } from '../src/glm-browser.ts'
import { UI_CAPABILITIES } from '../src/ui-health.ts'
import type { UiCapabilitySpec } from '../src/ui-health.ts'

// `matchesHook`-style trap: a provider supplies its OWN capability list, but
// `UI_CAPABILITIES` (DeepSeek's) is the documented reference. A capability the
// provider list DROPS is silently never probed — the probe reports the page
// healthy while the control it needs is gone. Pin that both lists agree on
// the set of probed capabilities.
test('GlmBrowser capability list covers the same capabilities as the reference', () => {
  const b = new GlmBrowser({ headless: true, locale: 'en' })
  const caps = b._uiCapabilities()
  const names = (list: UiCapabilitySpec[]): string[] =>
    list.map((c) => c.capability).sort()
  assert.deepEqual(names(caps), names(UI_CAPABILITIES))
})
