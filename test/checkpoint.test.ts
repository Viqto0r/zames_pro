import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  CheckpointStore,
  CHECKPOINT_EXCLUDES,
  tarCreateArgs,
  tarExtractArgs,
  rotateRecords,
  pickRecord,
  type CheckpointRecord,
} from '../src/checkpoint.ts'

async function tmpdir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

function rec(stamp: number, workdir = '/w'): CheckpointRecord {
  return { stamp, file: `/cp/${stamp}.tgz`, workdir }
}

test('tarCreateArgs excludes the heavy dirs and anchors at the root', () => {
  const args = tarCreateArgs('/cp/a.tgz', '/proj')
  assert.deepEqual(args.slice(0, 2), ['-czf', '/cp/a.tgz'])
  for (const e of CHECKPOINT_EXCLUDES) {
    assert.ok(args.includes('--exclude=./' + e), 'missing exclude ' + e)
  }
  // Anchored at the root: a nested node_modules is NOT excluded by this
  // pattern (tar treats './x' as the archive-root entry).
  assert.ok(args.includes('-C'))
  assert.equal(args[args.length - 1], '.')
})

test('tarExtractArgs extracts into the target dir', () => {
  assert.deepEqual(tarExtractArgs('/cp/a.tgz', '/tmp/x'), [
    '-xzf',
    '/cp/a.tgz',
    '-C',
    '/tmp/x',
  ])
})

test('rotateRecords keeps the newest `max` and never mutates input', () => {
  const input = [rec(1), rec(2), rec(3), rec(4)]
  const kept = rotateRecords(input, 2)
  assert.deepEqual(
    kept.map((r) => r.stamp),
    [3, 4],
  )
  assert.equal(input.length, 4)
  assert.deepEqual(
    rotateRecords([rec(1)], 5).map((r) => r.stamp),
    [1],
  )
  assert.deepEqual(rotateRecords([rec(1)], 0), [])
})

test('pickRecord: 1-based index, stamp prefix, and misses', () => {
  const newestFirst = [rec(300), rec(200), rec(100)]
  assert.equal(pickRecord(newestFirst, '1')?.stamp, 300)
  assert.equal(pickRecord(newestFirst, '3')?.stamp, 100)
  assert.equal(pickRecord(newestFirst, '4'), null)
  assert.equal(pickRecord(newestFirst, '0'), null)
  assert.equal(pickRecord(newestFirst, '2')?.stamp, 200)
  // Non-numeric selector matches a stamp prefix.
  assert.equal(pickRecord(newestFirst, '20')?.stamp, 200)
  assert.equal(pickRecord(newestFirst, '999'), null)
  assert.equal(pickRecord(newestFirst, ''), null)
})

test('create: snapshots the tree and skips heavy dirs', async () => {
  const work = await tmpdir('zames-cp-work-')
  const store = await tmpdir('zames-cp-store-')
  await fs.writeFile(path.join(work, 'a.txt'), 'hello')
  await fs.mkdir(path.join(work, 'sub'))
  await fs.writeFile(path.join(work, 'sub', 'b.txt'), 'nested')
  await fs.mkdir(path.join(work, 'node_modules'))
  await fs.writeFile(path.join(work, 'node_modules', 'x.js'), 'ignored')

  const cp = new CheckpointStore({ dir: store })
  const r = await cp.create(work)
  assert.ok(r, 'checkpoint should be created')
  assert.equal(r?.workdir, work)
  const stat = await fs.stat(r!.file)
  assert.ok(stat.size > 0)

  // Tarball contains the real files, not node_modules.
  const list = await cp.list(5)
  assert.equal(list.length, 1)
})

test('create: disabled store returns null', async () => {
  const work = await tmpdir('zames-cp-work-')
  const store = await tmpdir('zames-cp-store-')
  const cp = new CheckpointStore({ dir: store, enabled: false })
  assert.equal(await cp.create(work), null)
  assert.deepEqual(await cp.list(), [])
})

test('create: retention drops old archives from disk', async () => {
  const work = await tmpdir('zames-cp-work-')
  const store = await tmpdir('zames-cp-store-')
  await fs.writeFile(path.join(work, 'a.txt'), 'x')
  const cp = new CheckpointStore({ dir: store, maxBackups: 2 })
  const r1 = await cp.create(work)
  await new Promise((r) => setTimeout(r, 5))
  const r2 = await cp.create(work)
  await new Promise((r) => setTimeout(r, 5))
  const r3 = await cp.create(work)
  const kept = await cp.list(10)
  assert.equal(kept.length, 2)
  assert.equal(kept[0].stamp, r3?.stamp)
  assert.equal(kept[1].stamp, r2?.stamp)
  const gone = await fs
    .stat(r1!.file)
    .then(() => false)
    .catch(() => true)
  assert.ok(gone, 'oldest archive should be deleted')
})

test('restore: rolls the tree back and backs up the current state', async () => {
  const work = await tmpdir('zames-cp-work-')
  const store = await tmpdir('zames-cp-store-')
  await fs.writeFile(path.join(work, 'keep.txt'), 'v1')
  const cp = new CheckpointStore({ dir: store })
  const snap = await cp.create(work)
  assert.ok(snap)

  // Mutate the tree: change a file, add a new one, delete another.
  await fs.writeFile(path.join(work, 'keep.txt'), 'v2-broken')
  await fs.writeFile(path.join(work, 'added.txt'), 'junk')

  const res = await cp.restore('1')
  assert.equal(res.ok, true)
  assert.equal(res.record?.stamp, snap?.stamp)
  assert.ok(res.backup, 'pre-rewind backup must be created')

  assert.equal(await fs.readFile(path.join(work, 'keep.txt'), 'utf-8'), 'v1')
  const added = await fs
    .stat(path.join(work, 'added.txt'))
    .then(() => true)
    .catch(() => false)
  assert.equal(added, false, 'file added after the checkpoint must be gone')

  // The backup itself captured the broken state, so the rewind is reversible.
  const backupFile = res.backup!.file
  assert.ok((await fs.stat(backupFile)).size > 0)
})

test('restore: unknown selector / missing archive / disabled are coded', async () => {
  const work = await tmpdir('zames-cp-work-')
  const store = await tmpdir('zames-cp-store-')
  await fs.writeFile(path.join(work, 'a.txt'), 'x')
  const cp = new CheckpointStore({ dir: store })

  assert.equal((await cp.restore('1')).reason, 'not_found')

  const snap = await cp.create(work)
  await fs.rm(snap!.file, { force: true })
  assert.equal((await cp.restore('1')).reason, 'archive_missing')

  const off = new CheckpointStore({ dir: store, enabled: false })
  assert.equal((await off.restore('1')).reason, 'disabled')
})
