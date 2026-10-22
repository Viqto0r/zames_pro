import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { rotateNetLog } from '../src/net-capture.ts'
import { makeTmpDir } from './tmp-dir.ts'

// A foreign `.txt` in the net-log dir is COUNTED towards `keep` and deleted
// first (its name sorts before any `2026-…` dump). Both halves are wrong: the
// operator's note is destroyed AND the keep window is short by one dump.
test('a foreign .txt neither counts nor gets deleted', async (t) => {
  const dir = await makeTmpDir(t, 'zames-netlog-')
  await fs.writeFile(path.join(dir, 'notes.txt'), 'user data')
  for (let i = 1; i <= 4; i++) {
    await fs.writeFile(
      path.join(dir, `2026-01-0${i}T00-00-00-000Z_x.txt`),
      'dump',
    )
  }
  const removed = await rotateNetLog(dir, 2)
  assert.equal(removed, 2)
  const left = (await fs.readdir(dir)).sort()
  assert.deepEqual(left, [
    '2026-01-03T00-00-00-000Z_x.txt',
    '2026-01-04T00-00-00-000Z_x.txt',
    'notes.txt',
  ])
})
