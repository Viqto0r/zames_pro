import { test } from 'node:test'
import assert from 'node:assert/strict'
import { providerAskDeadlineMs } from '../src/config.ts'

function cfg(provider: string, askDeadlineMs: number, answerTimeoutMs: number) {
  return {
    provider,
    browser: { askDeadlineMs, answerTimeoutMs },
    qwen: { answerTimeoutMs },
    glm: { answerTimeoutMs },
  } as never
}

test('deepseek deadline is longer than its own answer timeout', () => {
  const d = providerAskDeadlineMs(cfg('deepseek', 120000, 180000))
  assert.ok(d > 180000, 'deadline ' + d + ' must exceed the answer timeout')
})

test('an explicitly raised askDeadlineMs is kept', () => {
  assert.equal(providerAskDeadlineMs(cfg('deepseek', 600000, 180000)), 600000)
})
