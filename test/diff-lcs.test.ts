import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unifiedDiff } from '../src/diff.ts'

const NL = String.fromCharCode(10)

// `unifiedDiff` compares the two texts LINE BY LINE AT THE SAME INDEX. One
// inserted line at the top shifts every following line, so a 20-line file with
// a single new first line reported ALL 20 lines as removed AND added (41 diff
// lines). The undo/`/diff` preview became unreadable and the model was told the
// whole file changed. A real diff (longest common subsequence) reports ONE
// added line.
test('an inserted line does not mark the whole file as changed', () => {
  const base = Array.from({ length: 20 }, (_, i) => 'line' + i).join(NL)
  const next = 'NEW' + NL + base
  const lines = unifiedDiff(base, next).split(NL)
  assert.equal(lines.filter((l) => l.startsWith('+')).length, 1)
  assert.equal(lines.filter((l) => l.startsWith('-')).length, 0)
  assert.deepEqual(lines, ['+NEW'])
})

test('a deleted line does not mark the whole file as changed', () => {
  const base = Array.from({ length: 20 }, (_, i) => 'line' + i).join(NL)
  const next = base.split(NL).slice(1).join(NL)
  const lines = unifiedDiff(base, next).split(NL)
  assert.deepEqual(lines, ['-line0'])
})

test('a replaced line is still one - and one +', () => {
  assert.deepEqual(unifiedDiff('a' + NL + 'b', 'a' + NL + 'c').split(NL), [
    '-b',
    '+c',
  ])
})

test('an empty side is handled', () => {
  assert.deepEqual(unifiedDiff('', 'x').split(NL), ['-', '+x'])
  assert.deepEqual(unifiedDiff('x', '').split(NL), ['-x', '+'])
})
