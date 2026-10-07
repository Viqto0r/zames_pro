import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  layoutInput,
  visLen,
  charWidth,
  isSubsequence,
  formatCompactTokens,
  formatTokenStatus,
  tokenStatusLevel,
  CONTEXT_LIMIT,
} from '../src/input/layout.ts'
import { visLen as visLenReexported } from '../src/input.ts'

// The pure input-line layout lives in src/input/layout.ts (C3 step 3). These
// tests pin the module boundary: the helpers are importable directly AND still
// re-exported from src/input.ts, so no caller import breaks.

test('layout module: layoutInput returns rows and a cursor position', () => {
  const r = layoutInput('> ', 'hello', 5, 80)
  assert.equal(r.rows.length, 1)
  assert.equal(r.cursorRow, 0)
  assert.equal(r.cursorCol, 7)
})

test('layout module: wide chars count as 2 columns', () => {
  assert.equal(charWidth(0x4e00), 2) // CJK
  assert.equal(charWidth(0x1f300), 2) // emoji
  assert.equal(charWidth(0x200d), 0) // ZWJ
  assert.equal(visLen('a\u4e00b'), 4)
})

test('layout module: helpers are re-exported from input.ts', () => {
  assert.equal(visLenReexported('a\u4e00b'), 4)
})

test('layout module: isSubsequence fuzzy match', () => {
  assert.equal(isSubsequence('hst', '/history'), true)
  assert.equal(isSubsequence('xyz', '/history'), false)
})

test('layout module: token formatting', () => {
  assert.equal(formatCompactTokens(1500), '1.5k')
  assert.equal(formatCompactTokens(null), '')
  assert.equal(tokenStatusLevel(0, CONTEXT_LIMIT), 'ok')
  assert.ok(formatTokenStatus(1000, CONTEXT_LIMIT).startsWith('ctx: 1k'))
})
