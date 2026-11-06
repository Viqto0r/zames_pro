import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToWidth, visLen } from '../src/input/layout.ts'

// The full-screen Header must stay exactly ONE row: FullScreenApp reserves
// HEADER_ROWS = 2 and derives the panel height from it. It truncates the
// working directory with `truncateToWidth(dir, budget)`, where the budget can
// be ZERO (title + provider already fill the row). A zero budget returned
// `a…` — TWO columns the caller did not ask for — so the title row wrapped and
// the layout clipped the top of the input panel. A tiny (1-column) budget has
// the same problem from the other side: `…` is exactly one column, which is
// correct, but a budget below 1 must not grow.

const text = 'abcdef'

test('a non-positive budget yields an empty string', () => {
  assert.equal(truncateToWidth(text, 0), '')
  assert.equal(truncateToWidth(text, -5), '')
})

test('a positive budget never exceeds it', () => {
  for (let b = 1; b <= text.length; b++) {
    const cut = truncateToWidth(text, b)
    assert.ok(
      visLen(cut) <= b,
      'budget ' + b + ' returned ' + JSON.stringify(cut),
    )
  }
})

test('a one-column budget is the ellipsis alone', () => {
  assert.equal(truncateToWidth(text, 1), '…')
})

test('an unclipped text is returned as is', () => {
  assert.equal(truncateToWidth('ab', 5), 'ab')
})
