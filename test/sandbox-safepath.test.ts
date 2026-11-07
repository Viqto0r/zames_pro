import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'
import { safePath } from '../src/sandbox.ts'

// safePath is the one gate every file tool goes through. The escape cases
// (../, a symlink out, a dangling link) have their own files; this one pins
// the ALLOWED side and the error contract: a path inside the root must come
// back resolved and unchanged, and a rejection must name the offending input
// so the operator can see what was refused.

function tmp(t: { after: (fn: () => unknown) => unknown }, prefix: string) {
  return makeTmpDirSync(t, prefix)
}

test('an existing file inside the root is returned as an absolute path', (t) => {
  const root = tmp(t, 'sbx-ok-')
  fs.writeFileSync(path.join(root, 'a.txt'), 'x')
  const out = safePath(root, 'a.txt')
  assert.equal(out, path.resolve(root, 'a.txt'))
  assert.ok(path.isAbsolute(out))
})

test('a not-yet-existing file inside the root is allowed', (t) => {
  const root = tmp(t, 'sbx-new-')
  const out = safePath(root, 'nested/dir/new.txt')
  assert.equal(out, path.resolve(root, 'nested/dir/new.txt'))
})

test('the root itself resolves to itself', (t) => {
  const root = tmp(t, 'sbx-root-')
  assert.equal(safePath(root, '.'), path.resolve(root))
  assert.equal(safePath(root, ''), path.resolve(root))
})

test('an absolute path inside the root is allowed', (t) => {
  const root = tmp(t, 'sbx-abs-')
  fs.writeFileSync(path.join(root, 'b.txt'), 'y')
  assert.equal(
    safePath(root, path.join(root, 'b.txt')),
    path.resolve(root, 'b.txt'),
  )
})

test('`..` traversal is rejected and the input is named in the error', (t) => {
  const root = tmp(t, 'sbx-dotdot-')
  assert.throws(
    () => safePath(root, '../outside.txt'),
    (err: Error) => {
      assert.match(err.message, /outside the working directory/i)
      assert.match(err.message, /\.\.\/outside\.txt/)
      return true
    },
  )
})

test('an absolute path outside the root is rejected', (t) => {
  const root = tmp(t, 'sbx-absout-')
  const outside = path.resolve(root, '..', 'elsewhere.txt')
  assert.throws(() => safePath(root, outside), /outside the working directory/i)
})

test('a sibling directory sharing the root prefix is rejected', (t) => {
  const root = tmp(t, 'sbx-prefix-')
  const sibling = root + '-old/file.txt'
  assert.throws(() => safePath(root, sibling), /outside the working directory/i)
})

test('a symlink to a file inside the root is allowed', (t) => {
  const root = tmp(t, 'sbx-linkin-')
  fs.writeFileSync(path.join(root, 'real.txt'), 'z')
  fs.symlinkSync(path.join(root, 'real.txt'), path.join(root, 'link.txt'))
  assert.equal(safePath(root, 'link.txt'), path.resolve(root, 'link.txt'))
})

test('a symlink pointing outside the root is rejected', (t) => {
  const root = tmp(t, 'sbx-linkout-')
  const outside = path.join(tmp(t, 'sbx-target-'), 'secret.txt')
  fs.writeFileSync(outside, 'secret')
  fs.symlinkSync(outside, path.join(root, 'evil.txt'))
  assert.throws(
    () => safePath(root, 'evil.txt'),
    /outside the working directory/i,
  )
})
