import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divider } from '../src/theme.ts'
import { contentWidth, setContentWidth } from '../src/width.ts'

// The answer separator and every other content block (answers, echo of the
// operator text, tool previews, warnings) now share ONE width from
// src/width.ts. One column is kept free (autowrap safety), never wider than
// the terminal, never shorter than 20.

function withCols(cols: number, fn: () => void): void {
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

test('divider follows the content width and is capped at 100', () => {
  withCols(120, () => {
    assert.equal(divider().length, 100, 'capped at 100 on a wide terminal')
  })
  withCols(80, () => {
    assert.equal(divider().length, 79, 'one column kept free under the cap')
  })
  withCols(10, () => {
    assert.equal(divider().length, 20, 'never shorter than 20')
  })
})

test('contentWidth is the shared margin for every block', () => {
  withCols(120, () => assert.equal(contentWidth(), 100))
  withCols(40, () => assert.equal(contentWidth(), 39))
  withCols(10, () => assert.equal(contentWidth(), 20))
})

test('contentWidth honors an explicit cap but not beyond the terminal', () => {
  withCols(200, () => {
    setContentWidth(60)
    try {
      assert.equal(contentWidth(), 60)
    } finally {
      setContentWidth(0)
    }
  })
})

test('divider accepts a shorter max for special call sites', () => {
  withCols(120, () => {
    assert.ok(divider(40).length <= 40)
  })
})
