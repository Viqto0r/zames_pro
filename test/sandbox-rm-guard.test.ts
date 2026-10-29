// `assertCommandInsideRoot` only validated a `cd` target. Everything else a
// command can do to the filesystem was unrestricted — `rm -rf` had no guard at
// all. A single slip in a cleanup command destroyed the project tree (and the
// parent directories) in a real session, so the absolute/deletion forms that
// can never be "inside the root" are now rejected:
//   * `rm` with a RECURSIVE flag aimed at an absolute path, `~`, `/`, `.` or
//     `..` (or a glob that resolves above the root);
//   * a recursive `rm` whose target is the ROOT itself.
// The check stays a static best-effort scan: it does not follow variables or
// shell expansions (a documented hole, same as `sh -c`).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { assertCommandInsideRoot } from '../src/shell.ts'

const root = path.join(os.tmpdir(), 'zames-sbx-rm-root')

test('a recursive rm of an absolute path is blocked', () => {
  assert.throws(
    () => assertCommandInsideRoot(root, 'rm -rf /home/user/project'),
    /Sandbox/,
  )
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf /'), /Sandbox/)
  assert.throws(
    () => assertCommandInsideRoot(root, 'rm -rf ' + root),
    /Sandbox/,
  )
})

test('a recursive rm with . or .. is blocked', () => {
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf .'), /Sandbox/)
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf ..'), /Sandbox/)
  assert.throws(() => assertCommandInsideRoot(root, 'rm -rf ../..'), /Sandbox/)
  assert.throws(
    () => assertCommandInsideRoot(root, 'cd sub && rm -rf ..'),
    /Sandbox/,
  )
})

test('an ordinary deletion inside the project is still allowed', () => {
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'rm -rf tmp/build'))
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'rm file.txt'))
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'rm -f dist/*.map'))
  assert.doesNotThrow(() => assertCommandInsideRoot(root, 'ls -la'))
})
