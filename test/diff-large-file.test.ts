// unifiedDiff() builds an O(n*m) LCS table in memory. The comment says "files
// here are a handful of lines", but the callers diff ARBITRARY source files
// (/undo preview, /self-diff over every .ts in src/). A 20 000-line file that
// changed wholesale allocates ~400M cells (~3.2 GB) and the process dies with
// an out-of-memory crash instead of showing a diff. The table must be bounded:
// past a sane size, fall back to a cheap line-by-line diff.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unifiedDiff } from '../src/diff.ts'

const NL = String.fromCharCode(10)

test('a very large file diff does not exhaust memory', () => {
  const n = 20_000
  const a = Array.from({ length: n }, (_, i) => 'line' + i).join(NL)
  const b = Array.from({ length: n }, (_, i) => 'new' + i).join(NL)
  // The old LCS table needed ~3.2 GB and crashed the process.
  const out = unifiedDiff(a, b)
  assert.ok(out.length > 0, 'empty diff')
  assert.ok(out.split(NL).length >= 2 * n, 'not a full change diff')
})

test('a small diff is still a real line diff', () => {
  const out = unifiedDiff('a' + NL + 'b' + NL + 'c', 'a' + NL + 'c', {
    label: 'x',
  })
  assert.ok(!out.includes('-a'), out)
  assert.ok(out.includes('-b'), out)
})
