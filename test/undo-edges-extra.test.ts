import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { UndoStore, undoDateLabel } from '../src/undo.ts'
import { makeTmpDir } from './tmp-dir.ts'

// The undo HISTORY is a plain JSON index plus .bak files, so its edges are the
// ones a crash, a hand edit or a pruned directory can produce. The existing
// tests cover the happy path and a few of them; this file pins the remaining
// current behaviour: machine-code reasons, retention trimming, a record that
// fails to restore being PUT BACK, and the pure date label.

async function store(t: { after: (fn: () => unknown) => unknown }) {
  const dir = await makeTmpDir(t, 'zames-undo-x-')
  return { dir, s: new UndoStore({ dir }) }
}

function indexOf(dir: string): string {
  return path.join(dir, 'index.json')
}

async function readIndex(dir: string): Promise<unknown[]> {
  return JSON.parse(await fs.readFile(indexOf(dir), 'utf-8')) as unknown[]
}

test('a disabled store refuses every operation with a machine code', async (t) => {
  const dir = await makeTmpDir(t, 'zames-undo-x-')
  const s2 = new UndoStore({ dir, enabled: false })
  const file = path.join(dir, 'f.txt')
  await fs.writeFile(file, 'x', 'utf-8')
  assert.equal(await s2.backup(file), null)
  // NOT prose: index.ts localizes these through the i18n catalog.
  assert.deepEqual(await s2.undoLast(), { ok: false, reason: 'disabled' })
  // A store created with the defaults is ENABLED, so the SAME call on it
  // reports an empty history instead.
  const enabled = new UndoStore({ dir })
  assert.deepEqual(await enabled.undoLast(), { ok: false, reason: 'empty' })
})

test('backup records an existing file and leaves the original in place', async (t) => {
  const { dir, s } = await store(t)
  const file = path.join(dir, 'f.txt')
  await fs.writeFile(file, 'v1', 'utf-8')
  const rec = await s.backup(file)
  assert.ok(rec)
  assert.equal(rec.existed, true)
  assert.equal(typeof rec.stamp, 'number')
  // The tool writes the new content AFTER the backup; backup itself never
  // touches the original.
  assert.equal(await fs.readFile(file, 'utf-8'), 'v1')
  const idx = await readIndex(dir)
  assert.equal(idx.length, 1)
  const bak = (idx[0] as { backupFile: string }).backupFile
  assert.equal(await fs.readFile(bak, 'utf-8'), 'v1')
})

test('backup of a file that does not exist yet records existed:false', async (t) => {
  const { dir, s } = await store(t)
  const file = path.join(dir, 'new.txt')
  const rec = await s.backup(file)
  assert.ok(rec)
  assert.equal(rec.existed, false)
  const idx = await readIndex(dir)
  assert.equal((idx[0] as { backupFile: unknown }).backupFile, null)
})

test('retention trims the oldest records AND their .bak files', async (t) => {
  const dir = await makeTmpDir(t, 'zames-undo-x-')
  const s = new UndoStore({ dir, maxBackups: 2 })
  const files: string[] = []
  for (let i = 0; i < 4; i++) {
    const f = path.join(dir, 'f' + i + '.txt')
    await fs.writeFile(f, 'v' + i, 'utf-8')
    files.push(f)
    await s.backup(f)
  }
  const idx = await readIndex(dir)
  assert.equal(idx.length, 2)
  // Only the two NEWEST originals survive in the index.
  assert.deepEqual(
    idx.map((r) => path.basename((r as { originalPath: string }).originalPath)),
    ['f2.txt', 'f3.txt'],
  )
  // The trimmed .bak files are gone from the directory.
  const baks = (await fs.readdir(dir)).filter((n) => n.endsWith('.bak'))
  assert.equal(baks.length, 2)
})

test('undoLast restores the newest and rewrites the index', async (t) => {
  const { dir, s } = await store(t)
  const file = path.join(dir, 'f.txt')
  await fs.writeFile(file, 'v1', 'utf-8')
  await s.backup(file)
  await fs.writeFile(file, 'v2', 'utf-8')
  const res = await s.undoLast()
  assert.equal(res.ok, true)
  assert.equal(res.record?.existed, true)
  assert.equal(await fs.readFile(file, 'utf-8'), 'v1')
  assert.equal((await readIndex(dir)).length, 0)
})

test('undoLast on a created file removes it', async (t) => {
  const { dir, s } = await store(t)
  const file = path.join(dir, 'made.txt')
  await s.backup(file)
  await fs.writeFile(file, 'created', 'utf-8')
  assert.equal((await s.undoLast()).ok, true)
  await assert.rejects(() => fs.stat(file))
})

test('a failed restore puts the record BACK so a retry still works', async (t) => {
  const { dir, s } = await store(t)
  const file = path.join(dir, 'f.txt')
  await fs.writeFile(file, 'v1', 'utf-8')
  await s.backup(file)
  await fs.writeFile(file, 'v2', 'utf-8')
  // Make the ORIGINAL path a non-empty directory: writing the backup over it
  // fails with EISDIR, which is the "real failure" branch.
  await fs.unlink(file)
  await fs.mkdir(file)
  await fs.writeFile(path.join(file, 'child'), 'x', 'utf-8')
  const res = await s.undoLast()
  assert.equal(res.ok, false)
  assert.ok(typeof res.reason === 'string' && res.reason.length > 0)
  // The record is NOT lost: the index still has it for the next attempt.
  assert.equal((await readIndex(dir)).length, 1)
})

test('list returns the newest rows first and caps at count', async (t) => {
  const { dir, s } = await store(t)
  for (let i = 0; i < 3; i++) {
    const f = path.join(dir, 'f' + i + '.txt')
    await fs.writeFile(f, 'v', 'utf-8')
    await s.backup(f)
  }
  const rows = await s.list(2)
  assert.deepEqual(
    rows.map((r) => path.basename(r.originalPath)),
    ['f2.txt', 'f1.txt'],
  )
  assert.equal((await s.list()).length, 3)
  // A negative count is "no rows" as well (slice(-(-1)) would be slice(1)).
  assert.deepEqual(await s.list(-1), [])
})

test('the index reader drops junk records and tolerates a broken file', async (t) => {
  const { dir, s } = await store(t)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    indexOf(dir),
    JSON.stringify([
      null,
      1,
      'x',
      { stamp: 1 },
      { originalPath: 42 },
      { originalPath: 'keep.txt', existed: false, stamp: 5, backupFile: null },
    ]),
    'utf-8',
  )
  const rows = await s.list()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].originalPath, 'keep.txt')
  // A file that is not even JSON reads as an empty history.
  await fs.writeFile(indexOf(dir), '{not json', 'utf-8')
  assert.deepEqual(await s.list(), [])
})

test('undoDateLabel never prints Invalid Date', () => {
  assert.equal(undoDateLabel(undefined), '(unknown time)')
  assert.equal(undoDateLabel(null), '(unknown time)')
  assert.equal(undoDateLabel('oops'), '(unknown time)')
  assert.equal(undoDateLabel(''), '(unknown time)')
  assert.equal(undoDateLabel(0), '(unknown time)')
  assert.equal(undoDateLabel(-5), '(unknown time)')
  assert.equal(undoDateLabel(Infinity), '(unknown time)')
  assert.equal(undoDateLabel(NaN), '(unknown time)')
  // A numeric STRING is accepted (an old index may store it quoted).
  const real = Date.UTC(2024, 0, 2, 3, 4, 5)
  assert.equal(undoDateLabel(String(real)), undoDateLabel(real))
  assert.equal(undoDateLabel(real).includes('Invalid'), false)
})
