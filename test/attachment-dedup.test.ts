import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AttachmentStore } from '../src/attachments.ts'

test('AttachmentStore.add de-duplicates by path', () => {
  const s = new AttachmentStore()
  const a = s.add({
    path: '/tmp/a.png',
    name: 'a.png',
    mime: 'image/png',
    size: 1,
  })
  const b = s.add({
    path: '/tmp/a.png',
    name: 'a.png',
    mime: 'image/png',
    size: 1,
  })
  assert.equal(a.marker, b.marker)
  assert.equal(a.marker, '[image#1]')
  assert.equal(s.items.length, 1)
  // A DIFFERENT path still gets a new marker.
  const c = s.add({
    path: '/tmp/b.png',
    name: 'b.png',
    mime: 'image/png',
    size: 1,
  })
  assert.equal(c.marker, '[image#2]')
})

test('AttachmentStore.add de-dups files too', () => {
  const s = new AttachmentStore()
  s.add({ path: '/tmp/a.txt', name: 'a.txt', mime: 'text/plain', size: 1 })
  s.add({ path: '/tmp/a.txt', name: 'a.txt', mime: 'text/plain', size: 1 })
  assert.equal(s.items.length, 1)
  assert.equal(s.items[0].marker, '[file#1]')
})

test('AttachmentStore.add de-dups identical content under DIFFERENT paths', () => {
  // A pasted image/clipboard item is saved to a NEW temp file every time, so
  // the path differs — the content hash must still collapse it to one marker.
  const s = new AttachmentStore()
  const a = s.add({
    path: '/tmp/paste-1.png',
    name: 'paste.png',
    mime: 'image/png',
    size: 10,
    hash: 'abc',
  })
  const b = s.add({
    path: '/tmp/paste-2.png',
    name: 'paste.png',
    mime: 'image/png',
    size: 10,
    hash: 'abc',
  })
  assert.equal(a.marker, b.marker)
  assert.equal(s.items.length, 1)
  // Different content -> a new marker.
  const c = s.add({
    path: '/tmp/paste-3.png',
    name: 'paste.png',
    mime: 'image/png',
    size: 10,
    hash: 'xyz',
  })
  assert.equal(c.marker, '[image#2]')
})
