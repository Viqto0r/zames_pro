import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDiff, formatDiffStat } from '../src/commands.ts'

// `maxLines` bounds the preview. A NEGATIVE value makes `lines.slice(0, -3)`
// DROP the LAST three lines and then report «13 more lines» for a 10-line diff
// — the operator sees a truncated diff with a nonsensical count. A zero value
// prints a LEADING blank line. The bound must be a real non-negative number.

const NL = String.fromCharCode(10)
const many = Array.from({ length: 10 }, (_, i) => 'line' + i).join(NL)

test('a negative maxLines never drops lines from the end', () => {
  const out = formatDiff(many, { maxLines: -3 })
  assert.equal(
    out.includes('line7'),
    false,
    'the tail was shown past the bound',
  )
  // A negative bound is clamped to ZERO: nothing of the diff is
  // shown and the note names all 10 lines.
  assert.match(out, /10 more lines/, JSON.stringify(out))
})

test('a zero maxLines does not print a leading blank line', () => {
  const out = formatDiff(many, { maxLines: 0 })
  assert.equal(out.startsWith(NL), false, JSON.stringify(out))
})

test('a positive bound keeps the head and counts the rest', () => {
  const out = formatDiff(many, { maxLines: 3 })
  assert.match(out, /^line0/)
  assert.match(out, /7 more lines/)
})

test('formatDiffStat behaves the same way', () => {
  assert.equal(formatDiffStat(many, { maxLines: -3 }).includes('line7'), false)
})
