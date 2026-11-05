import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { assertCommandInsideRoot } from '../src/shell.ts'

// The recursive-rm guard compared the RAW word with `.`/`..`, but a shell
// normalizes a trailing separator BEFORE the command runs: `rm -rf ./` and
// `rm -rf ../` are the same directories as `.` and `..`, so they wiped the
// project root (and its parent) with the guard never firing.
const root = path.join(os.tmpdir(), 'zames-sbx-rm-slash-root')

test('a recursive rm of ./ and ../ is blocked', () => {
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf ./'), /Sandbox/)
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf ../'), /Sandbox/)
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf .//'), /Sandbox/)
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf ..//'), /Sandbox/)
  assert.throws(
    () => assertCommandInsideRoot(root, 'rm -rf ' + root + '/'),
    /Sandbox/,
  )
})

test('a recursive rm with a trailing separator on a subdir is still allowed', () => {
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'rm -rf tmp/build/'))
})
