import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { safePath } from '../src/sandbox.ts'

// A BROKEN symlink inside the project points at a file that does not exist
// yet. `realpathSync` fails, so `realPathNearest` falls back to the LEXICAL
// path, which looks inside the root — the write is ALLOWED. But writing
// THROUGH that link creates the file at the link's target, OUTSIDE the
// project: the sandbox was escaped by a dangling link.
const root = path.resolve('tmp', 'sbx-dangling-' + process.pid)
const outside = path.resolve('tmp', 'OUTSIDE-' + process.pid + '.txt')

test('a dangling symlink pointing outside does not let a write escape', () => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outside, { force: true })
  fs.mkdirSync(root, { recursive: true })
  fs.symlinkSync(outside, path.join(root, 'evil.txt'))
  try {
    assert.throws(
      () => safePath(root, 'evil.txt'),
      /outside the working directory/i,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { force: true })
  }
})
