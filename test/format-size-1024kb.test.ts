// formatSize() promotes bytes -> KB -> MB by fixed divisors. Just under a
// megabyte the quotient is 1023.9990… KB, and toFixed(1) rounds it to
// "1024.0 KB" — a size ONE THOUSAND AND TWENTY-FOUR kilobytes, which should
// read as 1.0 MB. The same happens at the KB boundary (1023.96 KB).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSize } from '../src/attachments.ts'

test('formatSize never prints 1024.0 of a unit', () => {
  assert.equal(formatSize(1024 * 1024 - 1), '1.0 MB')
  // At the KB boundary the byte branch prints the exact byte count, which is
  // correct ("1023 B"), so only the KB->MB rollover is guarded here.
  assert.equal(formatSize(1000 * 1024), '1000.0 KB')
})

test('formatSize keeps ordinary sizes intact (control)', () => {
  assert.equal(formatSize(512), '512 B')
  assert.equal(formatSize(2048), '2.0 KB')
  assert.equal(formatSize(3 * 1024 * 1024), '3.0 MB')
})
