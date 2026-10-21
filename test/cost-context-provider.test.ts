import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderCost } from '../src/commands.ts'
import { translate } from '../src/i18n.ts'

// /cost is shown for EVERY provider, but its context line is hardcoded to
// DeepSeek's counter name. With Qwen/GLM active the operator reads
// "DeepSeek accumulated_token_usage" - a field those backends do not have.
const stats = {
  turns: 1,
  toolCalls: 0,
  toolCounts: {},
  toolMs: 0,
  toolTime: {},
  durationMs: 0,
  startedAt: null,
  autoCompacts: 0,
} as any

for (const locale of ['en', 'ru'] as const) {
  test(`/cost context line is provider-neutral (${locale})`, () => {
    const t = translate(locale)
    const known = renderCost(stats, null, 5000, t)
    const unknown = renderCost(stats, null, null, t)
    assert.ok(!/DeepSeek/i.test(known), known)
    assert.ok(!/DeepSeek/i.test(unknown), unknown)
  })
}
