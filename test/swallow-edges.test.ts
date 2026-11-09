import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  swallow,
  noteSwallowed,
  swallowedReport,
  resetSwallowed,
} from '../src/swallow.ts'

// test/swallow.test.ts pins the happy paths. The EDGES of the accounting
// helper were open: the tie-break (equal counts sort by tag, so /doctor is
// stable), the degenerate `limit` values, a NON-Error throw, and a `null`
// error in debug mode.

test('equal counts sort by tag, so the report is stable', () => {
  resetSwallowed()
  noteSwallowed('b')
  noteSwallowed('a')
  noteSwallowed('c')
  assert.deepEqual(
    swallowedReport().map((r) => r.tag),
    ['a', 'b', 'c'],
  )
})

test('a limit of 0 returns nothing, a negative one keeps the last entry', () => {
  resetSwallowed()
  noteSwallowed('a')
  assert.deepEqual(swallowedReport(0), [])
  // `slice(0, -1)` drops the LAST element — pinned as-is, not "fixed".
  assert.deepEqual(swallowedReport(-1), [])
  noteSwallowed('b')
  assert.deepEqual(
    swallowedReport(-1).map((r) => r.tag),
    ['a'],
  )
})

test('a non-Error throw is counted and printed as its string form', async () => {
  resetSwallowed()
  const orig = console.error
  const lines: string[] = []
  console.error = (l: unknown) => void lines.push(String(l))
  try {
    const v = await swallow(
      'raw',
      () => {
        throw 'plain'
      },
      1,
      true,
    )
    assert.equal(v, 1)
  } finally {
    console.error = orig
  }
  assert.deepEqual(swallowedReport(), [{ tag: 'raw', count: 1 }])
  assert.deepEqual(lines, ['[swallowed] raw: plain'])
})

test('an error-less note in debug mode prints just the tag', () => {
  resetSwallowed()
  const orig = console.error
  const lines: string[] = []
  console.error = (l: unknown) => void lines.push(String(l))
  try {
    noteSwallowed('tag', undefined, true)
    noteSwallowed('nul', null, true)
  } finally {
    console.error = orig
  }
  assert.deepEqual(lines, ['[swallowed] tag', '[swallowed] nul'])
})

test('a SYNC fn is accepted and its value is returned', async () => {
  resetSwallowed()
  assert.equal(await swallow('s', () => 'sync', 'fallback'), 'sync')
  assert.deepEqual(swallowedReport(), [])
})
