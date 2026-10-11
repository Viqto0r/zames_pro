import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHandoffText } from '../src/provider-handoff.ts'

// Provider-switch carry-over: the summary crosses a provider boundary, so the
// wording must tell the NEW model this is history from ANOTHER assistant, not a
// fresh instruction to redo the work. These pin the contract without touching
// the filesystem (save/read/clear are best-effort IO).

test('buildHandoffText marks the context as carried over from another assistant', () => {
  const t = buildHandoffText({
    from: 'DeepSeek',
    to: 'Qwen',
    summary: 'We refactored the config loader and added a test.',
    task: 'finish the refactor',
  })
  assert.match(t, /carried over/i)
  assert.match(t, /DeepSeek -> Qwen|DeepSeek .* Qwen/i)
  assert.match(t, /Do NOT redo/i)
  assert.ok(t.includes('We refactored the config loader'))
  assert.ok(t.includes('Original task: finish the refactor'))
})

test('buildHandoffText works without a task', () => {
  const t = buildHandoffText({ from: 'Qwen', to: 'DeepSeek', summary: 'x' })
  assert.ok(t.includes('x'))
  assert.ok(!t.includes('Original task'))
})

test('buildHandoffText trims the summary', () => {
  const t = buildHandoffText({
    from: 'A',
    to: 'B',
    summary: '  padded  ',
  })
  assert.ok(t.includes('padded'))
  assert.ok(!t.includes('  padded  '))
})
