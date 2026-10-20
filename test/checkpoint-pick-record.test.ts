import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickRecord } from '../src/checkpoint.ts'

// pickRecord resolves a `/rewind` selector against records NEWEST FIRST.
// A small number is an INDEX (1 = newest). The stamp-prefix fallback is meant
// for a timestamp, but it accepted ANY numeric prefix — so `/rewind 0` (or
// `/rewind 9` with 5 checkpoints) silently picked a checkpoint whose epoch-ms
// stamp happens to START with that digit. The operator asked for something the
// list never offered; a selector that matches nothing must report not_found.
function records(n: number): Array<{
  stamp: number
  file: string
  workdir: string
}> {
  const out = []
  for (let i = 0; i < n; i++) {
    const stamp = 1_730_000_000_000 + i
    out.push({ stamp, file: '/f' + i, workdir: '/w' })
  }
  return out
}

test('pickRecord: /rewind 0 does not silently pick a checkpoint', () => {
  assert.equal(pickRecord(records(5), '0'), null)
})

test('pickRecord: a bare out-of-range number is not a stamp prefix', () => {
  assert.equal(pickRecord(records(5), '9'), null)
})

test('pickRecord still resolves an index and a full stamp prefix', () => {
  const r = records(5)
  assert.equal(pickRecord(r, '1')?.file, '/f0', 'index 1 = newest')
  assert.equal(
    pickRecord(r, String(r[2].stamp))?.file,
    '/f2',
    'a full stamp selects that record',
  )
})
