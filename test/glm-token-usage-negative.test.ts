import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTokenUsage } from '../src/glm-net-capture.ts'

// z.ai reports the prompt size in `usage.prompt_tokens` (fallback
// `total_tokens`). The value becomes `browser._lastTokenUsage`, which feeds
// the context counter, /cost, /status and the auto-compact percentage. A
// NEGATIVE number is a nonsense payload, yet it was returned as-is: the
// counter then rendered a negative context (`tokenStatusLevel` rejects it, so
// the badge vanished while the auto-compact percentage went negative and
// never fired). It must be treated as "no usage", like a non-numeric value.
test('a negative prompt_tokens / total_tokens is not a usage', () => {
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { prompt_tokens: -3 } })),
    null,
  )
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { total_tokens: -1 } })),
    null,
  )
  assert.equal(
    extractTokenUsage(
      JSON.stringify({ data: { usage: { prompt_tokens: -5 } } }),
    ),
    null,
  )
})

test('a real usage is still returned', () => {
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { prompt_tokens: 42 } })),
    42,
  )
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { total_tokens: 7 } })),
    7,
  )
  // Zero is a legitimate (empty prompt) value and must NOT be treated as
  // missing — it is a finite non-negative number.
  assert.equal(
    extractTokenUsage(JSON.stringify({ usage: { prompt_tokens: 0 } })),
    0,
  )
})
