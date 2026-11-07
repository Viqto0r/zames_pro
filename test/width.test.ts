import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentWidth, setContentWidth } from '../src/width.ts'

// src/width.ts is the ONE width every UI part reads. A wrong value makes the
// answers, the divider and the tool previews wrap at different columns (the
// ragged look after a resize), so the four rules are pinned here: one column
// of autowrap safety, an explicit cap never wider than the terminal, a floor
// of 20 columns and 80 as the fallback when the TTY reports no width.

function withCols(cols: number | undefined, fn: () => void): void {
  const orig = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', {
    value: cols,
    configurable: true,
  })
  try {
    fn()
  } finally {
    Object.defineProperty(process.stdout, 'columns', {
      value: orig,
      configurable: true,
    })
  }
}

test('auto mode keeps one column of autowrap safety', () => {
  setContentWidth(0)
  withCols(100, () => assert.equal(contentWidth(), 99))
  withCols(81, () => assert.equal(contentWidth(), 80))
})

test('a missing terminal width falls back to 80 columns', () => {
  setContentWidth(0)
  withCols(undefined, () => assert.equal(contentWidth(), 79))
  withCols(0, () => assert.equal(contentWidth(), 79))
})

test('an explicit cap is honoured but never wider than the terminal', () => {
  try {
    setContentWidth(60)
    withCols(100, () => assert.equal(contentWidth(), 60))
    // On a narrow terminal the cap must not push the text past the edge.
    withCols(40, () => assert.equal(contentWidth(), 39))
  } finally {
    setContentWidth(0)
  }
})

test('the width never drops below 20 columns', () => {
  try {
    setContentWidth(0)
    withCols(10, () => assert.equal(contentWidth(), 20))
    withCols(21, () => assert.equal(contentWidth(), 20))
    withCols(22, () => assert.equal(contentWidth(), 21))
    setContentWidth(5)
    withCols(100, () => assert.equal(contentWidth(), 20))
  } finally {
    setContentWidth(0)
  }
})

test('a non-positive or non-numeric cap means auto', () => {
  withCols(120, () => {
    try {
      setContentWidth(-10)
      assert.equal(contentWidth(), 119)
      setContentWidth(Number.NaN)
      assert.equal(contentWidth(), 119)
      setContentWidth(Number.POSITIVE_INFINITY)
      // Infinity is a number > 0, so it is a cap; the terminal still wins.
      assert.equal(contentWidth(), 119)
    } finally {
      setContentWidth(0)
    }
  })
})
