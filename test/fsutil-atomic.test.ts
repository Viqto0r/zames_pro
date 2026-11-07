import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'
import { writeFileAtomic, writeJsonAtomic } from '../src/fsutil.ts'

// writeFileAtomic backs config/sessions/undo. The failure and symlink cases
// have their own files (fsutil-tmp-cleanup, fsutil-dangling-symlink); this one
// pins the SUCCESS contract: the mode, the JSON shape and writing THROUGH a
// symlink instead of replacing it.

function tmp(t: { after: (fn: () => unknown) => unknown }, prefix: string) {
  return makeTmpDirSync(t, prefix)
}

test('a new file is written 0o600 with the exact bytes', (t) => {
  const dir = tmp(t, 'fsutil-new-')
  const file = path.join(dir, 'a.txt')
  writeFileAtomic(file, 'hello')
  assert.equal(fs.readFileSync(file, 'utf8'), 'hello')
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  }
})

test('a missing parent directory is created', (t) => {
  const dir = tmp(t, 'fsutil-mkdir-')
  const file = path.join(dir, 'deep', 'nested', 'b.txt')
  writeFileAtomic(file, 'x')
  assert.equal(fs.readFileSync(file, 'utf8'), 'x')
})

test('a Buffer is written verbatim', (t) => {
  const dir = tmp(t, 'fsutil-buf-')
  const file = path.join(dir, 'c.bin')
  const buf = Buffer.from([0, 1, 2, 255])
  writeFileAtomic(file, buf)
  assert.deepEqual(fs.readFileSync(file), buf)
})

test('an existing file is overwritten and no temp file is left', (t) => {
  const dir = tmp(t, 'fsutil-over-')
  const file = path.join(dir, 'd.txt')
  fs.writeFileSync(file, 'old')
  writeFileAtomic(file, 'new')
  assert.equal(fs.readFileSync(file, 'utf8'), 'new')
  const left = fs.readdirSync(dir).filter((n) => n.includes('.tmp-'))
  assert.deepEqual(left, [])
})

test('a symlink keeps being a symlink and the real target is written', (t) => {
  const dir = tmp(t, 'fsutil-link-')
  const real = path.join(dir, 'real.txt')
  const link = path.join(dir, 'link.txt')
  fs.writeFileSync(real, 'old')
  fs.symlinkSync(real, link)
  writeFileAtomic(link, 'new')
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'the link must survive')
  assert.equal(fs.readFileSync(real, 'utf8'), 'new')
})

test('writeJsonAtomic writes 2-space JSON with a trailing newline', (t) => {
  const dir = tmp(t, 'fsutil-json-')
  const file = path.join(dir, 'e.json')
  writeJsonAtomic(file, { a: 1, b: [true, null] })
  const text = fs.readFileSync(file, 'utf8')
  assert.equal(text, '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}\n')
  assert.deepEqual(JSON.parse(text), { a: 1, b: [true, null] })
})

test('writeJsonAtomic escapes nothing and round-trips a nested value', (t) => {
  const dir = tmp(t, 'fsutil-json2-')
  const file = path.join(dir, 'f.json')
  const value = { s: 'a"b\\c\nd', n: -0.5, o: { x: [] } }
  writeJsonAtomic(file, value)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), value)
})
