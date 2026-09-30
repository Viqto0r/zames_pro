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
