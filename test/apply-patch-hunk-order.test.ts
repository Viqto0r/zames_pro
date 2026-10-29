// `applyUpdateHunk` applies several `@@` hunks of one file in order. Every
// block was located from index 0, so when two blocks carry the SAME anchor text
// a later block re-found the region an earlier one had already consumed — or,
// once that text was gone, failed with "Context not found" even though its own
// occurrence was still there. Hunks are written top-to-bottom, so the search
// must start where the previous block ended; a block that carries a `@@` line
// number may still point at an EARLIER region (the line number is the better
// anchor and the caller asked for exactly that line).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyUpdateHunk } from '../src/extraTools.ts'

const NL = String.fromCharCode(10)

test('two sequential blocks apply to their own regions', () => {
  const content = ['a', 'b', 'X', 'c', 'd', 'Y'].join(NL)
  const hunk = [
    '@@ -1,2 +1,1 @@',
    '-a',
    '-b',
    '+FIRST',
    '@@ -4,2 +3,2 @@',
    ' c',
    '-d',
    '+SECOND',
  ]
  const res = applyUpdateHunk(content, hunk)
  assert.equal(res.ok, true, res.error ?? 'expected ok')
  assert.equal(
    res.content as string,
    ['FIRST', 'X', 'c', 'SECOND', 'Y'].join(NL),
    'each hunk must apply to its own region',
  )
})

test('a later block re-uses the same anchor text without re-patching', () => {
  // Two identical `a/b` regions: block 1 patches the FIRST, block 2 (its own
  // `@@` points at the SECOND) must patch the SECOND one.
  const content = ['a', 'b', 'X', 'a', 'b', 'Y'].join(NL)
  const hunk = [
    '@@ -1,2 +1,2 @@',
    ' a',
    '-b',
    '+FIRST',
    '@@ -4,2 +4,2 @@',
    ' a',
    '-b',
    '+SECOND',
  ]
  const res = applyUpdateHunk(content, hunk)
  assert.equal(res.ok, true, res.error ?? 'expected ok')
  assert.equal(
    res.content as string,
    ['a', 'FIRST', 'X', 'a', 'SECOND', 'Y'].join(NL),
  )
})
