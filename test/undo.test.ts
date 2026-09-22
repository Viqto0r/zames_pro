import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import os from 'os'

const fakeHome = fsSync.mkdtempSync(path.join(os.tmpdir(), 'zames-home-'))
process.env.HOME = fakeHome
process.env.USERPROFILE = fakeHome

const { UndoStore } = await import('../src/undo.ts')

async function tmpFile(content?: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-undo-'))
  const f = path.join(dir, 'f.txt')
  if (content !== undefined) await fs.writeFile(f, content, 'utf-8')
  return f
}

test('backup + undoLast восстанавливает исходное содержимое', async () => {
  const f = await tmpFile('original')
  const undo = new UndoStore()
  await undo.backup(f)
  await fs.writeFile(f, 'changed', 'utf-8')
  const res = await undo.undoLast()
  assert.equal(res.ok, true)
  assert.equal(await fs.readFile(f, 'utf-8'), 'original')
})

test('undoLast удаляет файл, которого не было при backup', async () => {
  const f = await tmpFile() // does not exist
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

test('undo отключён в конфиге — backup ничего не делает', async () => {
  const f = await tmpFile('x')
  const undo = new UndoStore({ enabled: false })
  const r = await undo.backup(f)
  assert.equal(r, null)
})

test('list показывает последние записи', async () => {
  const f = await tmpFile('a')
  const undo = new UndoStore()
  await undo.backup(f)
  const items = await undo.list(5)
  assert.ok(items.length >= 1)
})
