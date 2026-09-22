import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  guessMime,
  isImageName,
  parseDataUrl,
  parseImagePaste,
  sniffMime,
  extForMime,
  formatSize,
  AttachmentStore,
  looksLikeFileName,
} from '../src/attachments.ts'

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const NL = String.fromCharCode(10)

test('isImageName распознаёт картинки по расширению', () => {
  assert.equal(isImageName('a.png'), true)
  assert.equal(isImageName('b.JPG'), true)
  assert.equal(isImageName('c.webp'), true)
  assert.equal(isImageName('d.txt'), false)
  assert.equal(isImageName('noext'), false)
})

test('guessMime даёт корректный mime', () => {
  assert.equal(guessMime('a.png'), 'image/png')
  assert.equal(guessMime('b.jpg'), 'image/jpeg')
  assert.equal(guessMime('x.unknownext'), 'application/octet-stream')
})

test('parseDataUrl извлекает картинку из data URL', () => {
  const url = 'data:image/png;base64,' + PNG_B64
  const res = parseDataUrl(url)
  assert.ok(res)
  assert.equal(res.mime, 'image/png')
  assert.ok(res.data.length > 0)
  assert.equal(sniffMime(res.data), 'image/png')
})

test('parseDataUrl не ловит обычный текст', () => {
  assert.equal(parseDataUrl('hello world'), null)
  assert.equal(parseDataUrl('{"tool":"Read"}'), null)
})

test('parseImagePaste ловит голый base64 PNG', () => {
  const res = parseImagePaste(PNG_B64)
  assert.ok(res, 'должно распознаться как картинка')
  assert.equal(res.mime, 'image/png')
})

test('parseImagePaste НЕ ловит обычный код/текст', () => {
  assert.equal(parseImagePaste('const x = 1'), null)
  assert.equal(parseImagePaste('hello' + NL + 'world'), null)
  assert.equal(parseImagePaste(Buffer.from('hello').toString('base64')), null)
})

test('extForMime подбирает расширение', () => {
  assert.equal(extForMime('image/png'), '.png')
  assert.equal(extForMime('image/jpeg'), '.jpg')
  assert.equal(extForMime('application/pdf'), '.pdf')
})

test('formatSize читаемый', () => {
  assert.equal(formatSize(512), '512 B')
  assert.equal(formatSize(2048), '2.0 KB')
  assert.equal(formatSize(3 * 1024 * 1024), '3.0 MB')
})

test('AttachmentStore нумерует картинки и файлы раздельно', () => {
  const s = new AttachmentStore()
  const a1 = s.add({ path: '/tmp/a.png', name: 'a.png', mime: 'image/png', size: 10 })
  const a2 = s.add({ path: '/tmp/b.txt', name: 'b.txt', mime: 'text/plain', size: 20 })
  const a3 = s.add({ path: '/tmp/c.jpg', name: 'c.jpg', mime: 'image/jpeg', size: 30 })
  assert.equal(a1.marker, '[image#1]')
  assert.equal(a2.marker, '[file#1]')
  assert.equal(a3.marker, '[image#2]')
  assert.equal(s.items.length, 3)
  s.reset()
  assert.equal(s.items.length, 0)
  assert.equal(s.imageCount, 0)
  assert.equal(s.fileCount, 0)
})

test('looksLikeFileName отличает имя файла от текста', () => {
  assert.equal(looksLikeFileName('report.pdf'), true)
  assert.equal(looksLikeFileName('my file.png'), true)
  assert.equal(looksLikeFileName('hello world'), false)
  assert.equal(looksLikeFileName('line1' + NL + 'line2.txt'), false)
})
