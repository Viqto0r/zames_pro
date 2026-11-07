import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SYSTEM_PROMPT_BUDGET_BYTES,
  CONTEXT_BUDGET_BYTES,
  kb,
  overBudget,
} from '../src/prompt-budget.ts'

// N6/N12: the system-prompt budget. /doctor and /context report the size in KB,
// so the kb formatting and the strict '>' comparison must stay exact.

test('kb prints one decimal and the KB suffix', () => {
  assert.equal(kb(0), '0.0 KB')
  assert.equal(kb(1024), '1.0 KB')
  assert.equal(kb(1536), '1.5 KB')
})

test('kb rounds to the nearest tenth', () => {
  assert.equal(kb(1280), '1.3 KB')
  assert.equal(kb(1024 * 1.24), '1.2 KB')
})

test('overBudget is strictly greater-than', () => {
  assert.equal(overBudget(100, 100), false)
  assert.equal(overBudget(101, 100), true)
  assert.equal(overBudget(99, 100), false)
})

test('overBudget works against the exported budgets', () => {
  assert.equal(
    overBudget(SYSTEM_PROMPT_BUDGET_BYTES - 1, SYSTEM_PROMPT_BUDGET_BYTES),
    false,
  )
  assert.equal(
    overBudget(SYSTEM_PROMPT_BUDGET_BYTES, SYSTEM_PROMPT_BUDGET_BYTES),
    false,
  )
  assert.equal(
    overBudget(SYSTEM_PROMPT_BUDGET_BYTES + 1, SYSTEM_PROMPT_BUDGET_BYTES),
    true,
  )
  assert.equal(overBudget(CONTEXT_BUDGET_BYTES + 1, CONTEXT_BUDGET_BYTES), true)
})

test('the context budget is the larger of the two', () => {
  assert.ok(CONTEXT_BUDGET_BYTES > SYSTEM_PROMPT_BUDGET_BYTES)
  assert.equal(SYSTEM_PROMPT_BUDGET_BYTES > 0, true)
})
