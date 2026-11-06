import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderContextReport } from '../src/context-command.ts'

// `/context` prints how many characters the SYSTEM PROMPT occupies. The size
// comes from the built prompt, and a caller that could not measure it (an
// empty/undefined builder result, a broken config) must not print
// `system prompt: NaN chars` — a nonsense number the operator cannot act on.
// The value is guarded (`typeof === 'number'`) but NaN IS a number, so it went
// straight into the report.

const empty = { agents: [], memory: [], skills: [], commands: [] }

test('a non-finite system-prompt size is not printed', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const out = renderContextReport(empty, { systemPromptChars: bad })
    assert.ok(
      !/NaN|Infinity/.test(out),
      'non-finite size leaked into the report: ' + out.split('\n')[1],
    )
  }
})

test('a real size is still printed', () => {
  const out = renderContextReport(empty, { systemPromptChars: 24000 })
  assert.match(out, /24000/)
})

test('an absent size prints no line at all', () => {
  const out = renderContextReport(empty)
  assert.ok(!/system prompt/i.test(out), out)
})
