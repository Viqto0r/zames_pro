// The compact token counter is shown in the status line right next to the
// context PERCENTAGE. It is read as a rounded approximation, so a value that
// ROUNDS to a full unit must be shown as that unit: 999_949 tokens is
// 999 949 / 1000 = 999.949k, which `Math.round` renders as `1000k` -- a
// nonsense "kilo" reading that should be `1M`, while the percentage beside it
// already says 100%. The same off-by-one existed in the M branch (a value
// just under 1M after rounding to one decimal).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCompactTokens } from '../src/input/layout.ts'

test('a value that rounds to 1000k is shown as 1M', () => {
  assert.equal(formatCompactTokens(999_949), '1M')
  assert.equal(formatCompactTokens(999_999), '1M')
})

test('a plain sub-million value still uses k', () => {
  assert.equal(formatCompactTokens(999_499), '999k')
  assert.equal(formatCompactTokens(125_000), '125k')
})

test('a value that rounds to 1000.0M is promoted past the M unit', () => {
  // 999_950_000 / 1e6 = 999.95 -> toFixed(1) = '1000.0', which reads like a
  // broken unit; it must be shown on the next scale instead.
  assert.equal(formatCompactTokens(999_950_000), '1B')
})
