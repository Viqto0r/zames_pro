import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitPaths } from '../src/gitTools.ts'

// `splitPaths` splits the `paths` argument on WHITESPACE only. A model that
// writes the list comma-separated (`"a.txt, b.txt"`, the natural form of a
// list in prose) got `['a.txt,', 'b.txt']` — the first pathspec carried the
// comma, matched nothing, and `git add` reported an error for a file that
// exists.
test('splitPaths: a comma-separated list is split into paths', () => {
  assert.deepEqual(splitPaths('a.txt, b.txt'), ['a.txt', 'b.txt'])
  assert.deepEqual(splitPaths('a.txt,b.txt'), ['a.txt', 'b.txt'])
})

test('splitPaths: a quoted path keeps its comma', () => {
  assert.deepEqual(splitPaths('"a,b.txt" c.txt'), ['a,b.txt', 'c.txt'])
})

test('splitPaths: plain whitespace still works', () => {
  assert.deepEqual(splitPaths('a.txt b.txt'), ['a.txt', 'b.txt'])
})
