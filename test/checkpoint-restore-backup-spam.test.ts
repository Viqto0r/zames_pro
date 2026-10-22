import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CheckpointStore } from '../src/checkpoint.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `restore()` takes a 'pre-rewind' backup of the CURRENT tree BEFORE it checks
// that the archive can be extracted. A corrupt archive (a truncated tarball,
// a file deleted on disk) therefore costs a FULL snapshot of the tree on every
// attempt: /checkpoints fills with identical 'pre-rewind' entries and the
// retention window starts evicting the real checkpoints the operator wanted to
// keep.
test('a failed extract does not leave a pre-rewind snapshot', async (t) => {
  const work = await makeTmpDir(t, 'zames-cp-work-')
  const store = await makeTmpDir(t, 'zames-cp-store-')
  await fs.writeFile(path.join(work, 'a.txt'), 'v1')
  const cp = new CheckpointStore({ dir: store })
  const snap = await cp.create(work)
  assert.ok(snap)
  // Corrupt the archive so extraction fails.
  await fs.writeFile(snap!.file, 'not a tarball')
  const before = (await cp.list(50)).length
  const res = await cp.restore('1')
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'extract_failed')
  const after = await cp.list(50)
  assert.equal(
    after.length,
    before,
    'a failed rewind created ' + (after.length - before) + ' snapshot(s)',
  )
})
