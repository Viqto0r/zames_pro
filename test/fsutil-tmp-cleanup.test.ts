// writeFileAtomic() writes to `<file>.tmp-<pid>` and renames over the target.
// If the write/fsync/rename throws (a full disk, EIO, a directory in the way)
// the temp file was left behind: every failed config/history/session write
// accumulated a stray `.tmp-<pid>` next to the real file (and the next failure
// of the SAME process reused that name, so the garbage was never cleaned).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { writeJsonAtomic } from '../src/fsutil.ts'

test('a failed atomic write leaves no temp file behind', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-fsu-'))
  const target = path.join(dir, 'c.json')
  // A directory at the target makes rename() fail on POSIX.
  await fs.mkdir(target)
  await assert.rejects(async () => writeJsonAtomic(target, { a: 1 }))
  const leftovers = (await fs.readdir(dir)).filter((f) => f.includes('.tmp-'))
  assert.deepEqual(leftovers, [])
  await fs.rm(dir, { recursive: true, force: true })
})
