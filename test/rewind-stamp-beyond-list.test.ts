import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickRecord } from '../src/checkpoint.ts'

// `/rewind` resolves the selector against `checkpoints.list(10)` — the 10
// NEWEST records — while `restore(selector)` resolves it against the WHOLE
// index. A FULL epoch-ms stamp is an exact, unambiguous name for a record, so
// the 10-entry DISPLAY window must not make an older checkpoint unaddressable:
// the command reported "/rewind failed" (not_found) for a stamp that restore()
// would have found. Worse, the prefix fallback could resolve that stamp to a
// NEWER record that merely shares its first digits.
function newest(): Array<{ stamp: number; file: string; workdir: string }> {
  return Array.from({ length: 10 }, (_, i) => ({
    stamp: 1_730_000_100_000 + i,
    file: '/today' + i,
    workdir: '/w',
  }))
}

/** An OLDER checkpoint (yesterday) that is not in the newest-10 window. */
const OLD = { stamp: 1_730_000_000_123, file: '/older', workdir: '/w' }

/** The full index, newest first, as `restore()` sees it. */
function index(): Array<{ stamp: number; file: string; workdir: string }> {
  return [...newest(), OLD]
}

test('a full stamp of a record outside the newest-10 list resolves', () => {
  const picked = pickRecord(newest(), String(OLD.stamp), index())
  assert.ok(picked, 'a full epoch-ms stamp is an exact selector')
  assert.equal(picked!.stamp, OLD.stamp)
  assert.equal(picked!.file, '/older')
})

test('without the full set the display window still cannot resolve it', () => {
  // Honest behaviour for a caller that only passes the window.
  assert.equal(pickRecord(newest(), String(OLD.stamp)), null)
})

test('an out-of-range short index stays a miss, not a stamp prefix', () => {
  assert.equal(pickRecord(newest(), '12', index()), null)
})

test('a short in-range index still picks that record', () => {
  assert.equal(pickRecord(newest(), '1', index())?.file, '/today0')
})

test('a full stamp in the window is picked by exact match', () => {
  const recs = newest()
  assert.equal(
    pickRecord(recs, String(recs[3].stamp), index())?.file,
    '/today3',
  )
})
