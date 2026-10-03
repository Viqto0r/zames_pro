import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divider } from '../src/theme.ts'

// The answer separator used to be a hardcoded '─'.repeat(60), which looks
// stubby on a wide terminal. divider() now spans the terminal width (capped)
// and never reaches the last column (autowrap safety).

test('divider follows the terminal width but is capped', () => {
  const orig = process.stdout.columns
  const setCols = (n: number): void => {
    Object.defineProperty(process.stdout, 'columns', {
      value: n,
      configurable: true,
    })
  }
  try {
    setCols(120)
    assert.equal(divider().length, 100, 'capped at 100 even on a wide terminal')
    setCols(80)
    assert.equal(divider().length, 79, 'one column kept free below the cap')
    setCols(0)
    assert.equal(divider().length, 60, 'unknown width falls back to 60')
    setCols(10)
    assert.equal(divider().length, 20, 'never shorter than 20')
  } finally {
    Object.defineProperty(process.stdout, 'columns', {
      value: orig,
      configurable: true,
    })
  }
})
