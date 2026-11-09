import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHECKPOINT_EXCLUDES,
  tarCreateArgs,
  tarExtractArgs,
  rotateRecords,
  isFullStampSelector,
  pickRecord,
  type CheckpointRecord,
} from '../src/checkpoint.ts'
import { undoDateLabel } from '../src/undo.ts'

// test/checkpoint.test.ts pins the happy path of the tar helpers and the
// /rewind selector; the EDGES were open: a non-positive retention, the
// exclude anchors (a nested `src/tmp` must NOT be excluded), a stamp selector
// with surrounding spaces, and the /undo-list date label for every flavour of
// unusable stamp.

const rec = (stamp: number, file = String(stamp)): CheckpointRecord => ({
  stamp,
  file,
  workdir: '/w',
})

test('the excludes are anchored to the archive ROOT, never a nested dir', () => {
  assert.deepEqual(CHECKPOINT_EXCLUDES, ['node_modules', '.git', 'dist', 'tmp'])
  const args = tarCreateArgs('/a.tgz', '/w')
  assert.equal(args[0], '-czf')
  assert.equal(args[1], '/a.tgz')
  for (const e of CHECKPOINT_EXCLUDES) {
    assert.ok(args.includes('--exclude=./' + e), 'missing --exclude=./' + e)
    // A bare `tmp` pattern would also drop `src/tmp`.
    assert.ok(!args.includes('--exclude=' + e), 'unanchored exclude ' + e)
  }
  // The archive root is the LAST argument pair.
  assert.deepEqual(args.slice(-3), ['-C', '/w', '.'])
})

test('extraction always targets the given directory', () => {
  assert.deepEqual(tarExtractArgs('/a.tgz', '/w'), [
    '-xzf',
    '/a.tgz',
    '-C',
    '/w',
  ])
})

test('retention: 0 or less keeps NOTHING, a big max keeps everything', () => {
  assert.deepEqual(rotateRecords([1, 2, 3], 0), [])
  assert.deepEqual(rotateRecords([1, 2, 3], -1), [])
  assert.deepEqual(rotateRecords([1, 2, 3], 5), [1, 2, 3])
  // The kept window is the TAIL (the newest records).
  assert.deepEqual(rotateRecords([1, 2, 3, 4, 5], 2), [4, 5])
  // The input array is never mutated.
  const input = [1, 2, 3]
  const kept = rotateRecords(input, 2)
  assert.deepEqual(input, [1, 2, 3])
  assert.notEqual(kept, input)
  assert.deepEqual(rotateRecords([], 3), [])
})

test('only an EXACT 13-digit stamp is a full-stamp selector', () => {
  assert.equal(isFullStampSelector('1700000000000'), true)
  assert.equal(
    isFullStampSelector(' 1700000000000 '),
    true,
    'spaces are trimmed',
  )
  assert.equal(isFullStampSelector('123'), false)
  assert.equal(isFullStampSelector('12345678901234'), false)
  assert.equal(isFullStampSelector('1700000000000x'), false)
  assert.equal(isFullStampSelector(''), false)
  assert.equal(isFullStampSelector(null as never), false)
  assert.equal(isFullStampSelector(undefined as never), false)
})

test('a full stamp wins over the index window and finds an OLD record', () => {
  const window = [rec(1700000001000, 'new'), rec(1700000000000, 'old')]
  // Present in the display window: resolved by exact stamp.
  assert.equal(pickRecord(window, '1700000000000')?.file, 'old')
  // NOT in the window but in the full index: still found.
  const all = [...window, rec(1600000000000, 'older')]
  assert.equal(
    pickRecord(window, '1600000000000', all)?.file,
    'older',
    'a full stamp must search the WHOLE index',
  )
  // A stamp that shares its first digits with a NEWER one is not confused.
  assert.equal(pickRecord(window, '1700000000000', all)?.file, 'old')
})

test('an index is 1-based; a bare out-of-range digit is NOT a stamp', () => {
  const recs = [rec(1700000000000, 'a'), rec(1700000001000, 'b')]
  assert.equal(pickRecord(recs, '1')?.file, 'a')
  assert.equal(pickRecord(recs, '2')?.file, 'b')
  assert.equal(pickRecord(recs, '9'), null, '/rewind 9 must not prefix-match')
  assert.equal(pickRecord(recs, '0'), null)
  assert.equal(pickRecord(recs, ''), null)
  assert.equal(pickRecord([], '1'), null)
  // A TWO-digit prefix resolves as a stamp prefix.
  assert.equal(pickRecord(recs, '17')?.file, 'a')
})

test('an unusable undo stamp prints the placeholder, a real one a date', () => {
  for (const bad of [0, -5, Number.NaN, Infinity, 'x', null, undefined, {}]) {
    assert.equal(undoDateLabel(bad), '(unknown time)', String(bad))
  }
  const label = undoDateLabel(1_700_000_000_000)
  assert.notEqual(label, '(unknown time)')
  assert.ok(!label.includes('Invalid'), label)
  // A NUMERIC STRING is accepted (an index written by an older format).
  assert.equal(undoDateLabel('1700000000000'), undoDateLabel(1_700_000_000_000))
})
