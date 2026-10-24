// formatSize() only ever promoted up to MB, so a multi-GB file (a model, a
// video, a big archive) read as `5120.0 MB`, and a non-finite byte count (a
// size computed from a broken Content-Length) printed `Infinity MB`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSize } from '../src/attachments.ts'

test('formatSize promotes gigabytes to GB', () => {
  assert.equal(formatSize(1024 * 1024 * 1024), '1.0 GB')
  assert.equal(formatSize(5 * 1024 * 1024 * 1024), '5.0 GB')
})

test('formatSize never prints a non-finite size', () => {
  assert.equal(formatSize(Infinity), '0 B')
  assert.equal(formatSize(-Infinity), '0 B')
})

test('formatSize keeps MB/B intact (control)', () => {
  assert.equal(formatSize(3 * 1024 * 1024), '3.0 MB')
  assert.equal(formatSize(512), '512 B')
})
