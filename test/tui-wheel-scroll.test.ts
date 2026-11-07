import { test } from 'node:test'
import assert from 'node:assert/strict'

// The full-screen app turns a wheel delta into a scroll OFFSET. The rule is
// tiny but easy to get wrong (a negative offset paints nothing, a runaway
// offset scrolls past the end and the next Up key jumps), so the arithmetic is
// pinned here — without mounting Ink. The constants mirror FullScreenApp's
// `delta * 3` and the clamp to [0, maxScroll].

const STEP = 3

function nextScroll(cur: number, delta: number, maxScroll: number): number {
  return Math.max(0, Math.min(maxScroll, cur + delta * STEP))
}

test('one notch scrolls three rows', () => {
  assert.equal(nextScroll(0, 1, 100), 3)
  assert.equal(nextScroll(10, -1, 100), 7)
})

test('a downward wheel at the top cannot go negative', () => {
  assert.equal(nextScroll(0, -1, 100), 0)
  assert.equal(nextScroll(1, -5, 100), 0)
})

test('an upward wheel at the end stops at maxScroll', () => {
  assert.equal(nextScroll(100, 1, 100), 100)
  assert.equal(nextScroll(99, 10, 100), 100)
})

test('a big delta is clamped in both directions', () => {
  assert.equal(nextScroll(50, 1000, 100), 100)
  assert.equal(nextScroll(50, -1000, 100), 0)
})

test('an empty log (maxScroll 0) never moves', () => {
  assert.equal(nextScroll(0, 1, 0), 0)
  assert.equal(nextScroll(0, -1, 0), 0)
})

test('two notches sum before the clamp', () => {
  assert.equal(nextScroll(96, 2, 100), 100)
  assert.equal(nextScroll(4, -2, 100), 0)
})
