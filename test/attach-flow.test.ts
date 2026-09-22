import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  AttachmentStore,
  parseImagePaste,
  saveToTemp,
  looksLikeFilePath,
  guessMime,
  isImageName,
} from '../src/attachments.ts'

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

test('saveToTemp кладёт файл в tmp и не перезаписывает существующие', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-tmp-'))
  const data = Buffer.from('hello')
  const p1 = await saveToTemp(dir, 'x.txt', data)
  const p2 = await saveToTemp(dir, 'x.txt', data)
  assert.notEqual(p1, p2)
  assert.equal(path.basename(p1), 'x.txt')
  assert.equal(path.basename(p2), 'x-1.txt')
  assert.equal(await fs.readFile(p1, 'utf-8'), 'hello')
  await fs.rm(dir, { recursive: true, force: true })
})

test('saveToTemp санитизирует имя', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-tmp-'))
  const p = await saveToTemp(dir, '../../etc/passwd', Buffer.from('x'))
  // Slashes are replaced, so the file stays inside the temp dir.
  assert.ok(path.resolve(p).startsWith(path.resolve(dir)))
  assert.equal(path.dirname(path.resolve(p)), path.resolve(dir))
  await fs.rm(dir, { recursive: true, force: true })
})

test('looksLikeFilePath распознаёт пути и имена файлов', () => {
  assert.equal(looksLikeFilePath('/tmp/a.png'), true)
  assert.equal(looksLikeFilePath('./img.jpg'), true)
  assert.equal(looksLikeFilePath('photo.png'), true)
  assert.equal(looksLikeFilePath('hello world'), false)
  assert.equal(looksLikeFilePath(''), false)
})

test('маркеры image/file попадают в текст сообщения (сквозной сценарий)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-flow-'))
  const store = new AttachmentStore()
  const img = parseImagePaste(PNG_B64)
  assert.ok(img)
  const p = await saveToTemp(dir, 'paste' + '.png', img.data)
  const att = store.add({ path: p, name: 'paste.png', mime: img.mime, size: img.data.length })
  assert.equal(att.marker, '[image#1]')
  // simulate the input line containing the marker plus user text
  const line = 'посмотри на это ' + att.marker + ' что тут?'
  assert.ok(line.includes('[image#1]'))
  assert.equal(store.items[0].path, p)
  await fs.rm(dir, { recursive: true, force: true })
})

test('guessMime/isImageName работают для вложений-картинок', () => {
  assert.equal(isImageName('shot.PNG'), true)
  assert.equal(guessMime('shot.PNG'), 'image/png')
})
