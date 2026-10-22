import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CheckpointStore } from '../src/checkpoint.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `_readIndex()` swallows a parse error and returns `[]`. When `index.json` is
// CORRUPT (a crash mid-write on a filesystem without atomic rename, a hand
// edit, an antivirus truncation) the archives are still on disk but every
// record is invisible: `/rewind` says "nothing to rewind" and the next
// checkpoint starts a fresh index, so the orphans can never be pruned either.
test('a corrupt index does not hide the existing checkpoints', async (t) => {
  const work = await makeTmpDir(t, 'zames-cp-work-')
  const store = await makeTmpDir(t, 'zames-cp-store-')
  await fs.writeFile(path.join(work, 'a.txt'), 'v1')
  const cp = new CheckpointStore({ dir: store })
  const r = await cp.create(work)
  assert.ok(r)
  // Corrupt the index the way a crash would.
  await fs.writeFile(path.join(store, 'index.json'), '{"stamp": 12')
  const list = await cp.list(10)
  assert.equal(
    list.length,
    1,
    'the archive on disk became unreachable after an index corruption',
  )
})
