import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatSize,
  parseDataUrl,
  sniffMime,
  looksLikeFilePath,
  looksLikeFileName,
  AttachmentStore,
} from '../src/attachments.ts'

// test/attachments.test.ts and its siblings pin the main behaviour. The EDGES
// were open: the size formatter's unit promotion and its non-finite/negative
// input, an EMPTY data URL (a zero-byte attachment), the magic-byte sniffer's
// short buffer, a URL embedded in prose, a VERSION pasted as a file name, and
// content-hash de-duplication in the store.

test('formatSize promotes before the rounded value reads as 1024.0', () => {
  assert.equal(formatSize(0), '0 B')
  assert.equal(formatSize(1023), '1023 B')
  assert.equal(formatSize(1024), '1.0 KB')
  // 1023.999 KB rounds to 1024.0 KB -> must read as 1.0 MB.
  assert.equal(formatSize(1023.999 * 1024), '1.0 MB')
  assert.equal(formatSize(1024 * 1024), '1.0 MB')
  assert.equal(formatSize(1024 * 1024 * 1024), '1.0 GB')
})

test('formatSize never prints Infinity / NaN, and keeps a negative sign', () => {
  assert.equal(formatSize(Number.NaN), '0 B')
  assert.equal(formatSize(Number.POSITIVE_INFINITY), '0 B')
  // A negative size is nonsense but must not become a huge positive one.
  assert.equal(formatSize(-5), '-5 B')
})

test('an EMPTY data URL is not an attachment', () => {
  assert.equal(parseDataUrl('data:image/png;base64,'), null)
  // A payload with no mime falls back to octet-stream, but the bytes survive.
  const r = parseDataUrl('data:;base64,aGVsbG8=')
  assert.equal(r?.mime, 'application/octet-stream')
  assert.equal(r?.data.toString('utf-8'), 'hello')
  // Not a data URL at all.
  assert.equal(parseDataUrl('hello'), null)
  assert.equal(parseDataUrl('data:text/plain,abc'), null)
})

test('sniffMime needs four magic bytes and returns empty otherwise', () => {
  assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'image/png')
  // The sniffer needs FOUR bytes for every signature (a 3-byte JPEG head
  // returns empty): pinned as-is, the caller falls back to the stored MIME.
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff])), '')
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(sniffMime(Buffer.from([1, 2])), '')
  assert.equal(sniffMime(Buffer.alloc(0)), '')
  assert.equal(sniffMime(Buffer.from('plain text')), '')
})

test('a URL in prose is not a file path, a name/version is not a file', () => {
  assert.equal(looksLikeFilePath('see https://x/a.png'), false)
  assert.equal(looksLikeFilePath('https://x/a.png'), false)
  assert.equal(looksLikeFilePath('./a.png'), true)
  assert.equal(looksLikeFilePath('a b.txt'), true)
  assert.equal(looksLikeFileName('a.PNG'), true)
  assert.equal(looksLikeFileName('отчёт.pdf'), true)
  // An ALL-DIGIT extension is a VERSION, not a file name.
  assert.equal(looksLikeFileName('2.96.15'), false)
  assert.equal(looksLikeFileName('plain prose'), false)
})

test('the store de-dups identical CONTENT under a different path', () => {
  const store = new AttachmentStore()
  const first = store.add({
    path: '/tmp/x.png',
    name: 'x.png',
    mime: 'image/png',
    size: 1,
    hash: 'h1',
  })
  const second = store.add({
    path: '/tmp/y.png',
    name: 'y.png',
    mime: 'image/png',
    size: 1,
    hash: 'h1',
  })
  assert.equal(second, first, 'the same content must return the SAME entry')
  assert.equal(store.items.length, 1)
  assert.equal(store.imageCount, 1)
  assert.equal(store.fileCount, 0)
  assert.equal(first.marker, '[image#1]')
})

test('reset empties the list IN PLACE (the UI holds the reference)', () => {
  const store = new AttachmentStore()
  store.add({ path: '/tmp/a.txt', name: 'a.txt', mime: 'text/plain', size: 1 })
  const ref = store.items
  store.reset()
  assert.equal(store.items, ref, 'reset must not replace the array')
  assert.equal(ref.length, 0)
  assert.equal(store.imageCount, 0)
  assert.equal(store.fileCount, 0)
})
