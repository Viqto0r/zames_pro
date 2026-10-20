import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import os from 'os'
import { makeTmpDir, makeTmpDirSync } from './tmp-dir.ts'

const fakeHome = makeTmpDirSync(
  {
    on: (e: string, fn: () => unknown) => {
      if (e === 'end') after(fn)
    },
  },
  'zames-home-',
)
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome

const { UndoStore } = await import('../src/undo.ts')

async function tmpFile(
  t: { after: (fn: () => unknown) => unknown },
  content?: string,
): Promise<string> {
  const dir = await makeTmpDir(t, 'zames-undo-')
  const f = path.join(dir, 'f.txt')
  if (content !== undefined) await fs.writeFile(f, content, 'utf-8')
  return f
}

test('backup + undoLast восстанавливает исходное содержимое', async (t) => {
  const f = await tmpFile(t, 'original')
  const undo = new UndoStore()
  await undo.backup(f)
  await fs.writeFile(f, 'changed', 'utf-8')
  const res = await undo.undoLast()
  assert.equal(res.ok, true)
  assert.equal(await fs.readFile(f, 'utf-8'), 'original')
})

test('undoLast удаляет файл, которого не было при backup', async (t) => {
  const f = await tmpFile(t) // does not exist
  const undo = new UndoStore()
  await undo.backup(f)
  await fs.writeFile(f, 'created later', 'utf-8')
  const res = await undo.undoLast()
  assert.equal(res.ok, true)
  await assert.rejects(() => fs.readFile(f, 'utf-8'))
})

test('undoLast на пустой истории возвращает ошибку, а не падает', async () => {
  const undo = new UndoStore()
  const res = await undo.undoLast()
  assert.equal(res.ok, false)
})

test('undo отключён в конфиге — backup ничего не делает', async (t) => {
  const f = await tmpFile(t, 'x')
  const undo = new UndoStore({ enabled: false })
  const r = await undo.backup(f)
  assert.equal(r, null)
})

test('list показывает последние записи', async (t) => {
  const f = await tmpFile(t, 'a')
  const undo = new UndoStore()
  await undo.backup(f)
  const items = await undo.list(5)
  assert.ok(items.length >= 1)
})

// A backup file can vanish behind our back: ~/.zames/undo is a plain folder
// the operator (or a cleanup script) may prune, and a crash between the copy
// and the index write leaves a record without its .bak. Popping such a record
// and then FAILING left the history index untouched, so every later /undo kept
// re-failing on the same dead record — the earlier backups became unreachable.
// A dead record must be dropped and the undo must fall through to the previous
// one.
test('undoLast skips a record whose backup file is gone', async (t) => {
  const f = await tmpFile(t, 'original')
  const undo = new UndoStore()
  await undo.backup(f) // backup #1: 'original'
  await fs.writeFile(f, 'changed', 'utf-8')
  await undo.backup(f) // backup #2: 'changed'
  await fs.writeFile(f, 'final', 'utf-8')

  // The newest .bak disappears.
  const list = (await undo.list(1000)).filter((r) => r.originalPath === f)
  const before = list.length
  const newest = list[0]
  assert.ok(newest && newest.backupFile)
  const dead = newest
  await fs.rm(newest.backupFile as string)

  const res = await undo.undoLast()
  assert.equal(res.ok, true)
  assert.equal(await fs.readFile(f, 'utf-8'), 'original')
  // The dead record is gone from the history, not retried forever.
  // (list() is shared with the other tests and its default count is 10, so
  // compare the stored records by id instead of counting them.)
  const left = await undo.list(1000)
  assert.equal(left.length, before - 1)
  assert.ok(
    !left.some(
      (r) => r.stamp === dead.stamp && r.backupFile === dead.backupFile,
    ),
  )
})
