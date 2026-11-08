import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SYSTEM_PROMPT_BUDGET_BYTES,
  CONTEXT_BUDGET_BYTES,
  kb,
  overBudget,
} from '../src/prompt-budget.ts'

// prompt-budget.test.ts pins the formatting and the strict '>' compare.
// These cases pin the NUMBERS the two reports depend on and the inputs a
// hand-edited config / a broken measurement can produce: kb rounds HALF UP to
// one decimal, the exported budgets are exact byte counts (a silent change
// shifts when /doctor turns WARN and when auto-compact fires), and a
// non-finite value never reads as "over budget".

test('the budget constants are the documented byte counts', () => {
  assert.equal(SYSTEM_PROMPT_BUDGET_BYTES, 24000)
  assert.equal(CONTEXT_BUDGET_BYTES, 120000)
  assert.equal(kb(SYSTEM_PROMPT_BUDGET_BYTES), '23.4 KB')
  assert.equal(kb(CONTEXT_BUDGET_BYTES), '117.2 KB')
})

test('kb rounds half up at the tenth', () => {
  assert.equal(kb(1023), '1.0 KB')
  assert.equal(kb(1025), '1.0 KB')
  assert.equal(kb(1024 * 1.05), '1.1 KB')
  assert.equal(kb(512), '0.5 KB')
  assert.equal(kb(1024 * 1024), '1024.0 KB')
})

test('kb keeps the sign of a negative size', () => {
  assert.equal(kb(-1024), '-1.0 KB')
})

test('a non-finite value is printed as-is, not hidden', () => {
  assert.equal(kb(Number.NaN), 'NaN KB')
  assert.equal(kb(Number.POSITIVE_INFINITY), 'Infinity KB')
})

test('a non-finite size is never over budget', () => {
  assert.equal(overBudget(Number.NaN, 100), false)
  assert.equal(overBudget(Number.POSITIVE_INFINITY, 100), true)
})

test('a non-finite budget never reports over budget', () => {
  assert.equal(overBudget(101, Number.NaN), false)
  assert.equal(overBudget(101, Number.POSITIVE_INFINITY), false)
})

test('a zero budget is exceeded by any positive size', () => {
  assert.equal(overBudget(1, 0), true)
  assert.equal(overBudget(0, 0), false)
})
