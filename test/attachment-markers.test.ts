import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  substituteAttachmentMarkers,
  rewriteFailedAttachments,
} from '../src/commands.ts'

test('substituteAttachmentMarkers: file marker becomes the path', () => {
  const out = substituteAttachmentMarkers('look at [file#1] please', [
    { path: '/tmp/report.pdf', name: 'report.pdf', mime: 'application/pdf' },
  ])
  assert.equal(out, 'look at /tmp/report.pdf please')
})

test('substituteAttachmentMarkers: image marker becomes the path', () => {
  const out = substituteAttachmentMarkers('see [image#1]', [
    { path: '/tmp/pic.png', name: 'pic.png', mime: 'image/png' },
  ])
  assert.equal(out, 'see /tmp/pic.png')
})

test('substituteAttachmentMarkers: images and files counted separately', () => {
  const atts = [
    { path: '/tmp/img1.png', name: 'img1.png', mime: 'image/png' },
    { path: '/tmp/doc.txt', name: 'doc.txt', mime: 'text/plain' },
    { path: '/tmp/img2.png', name: 'img2.png', mime: 'image/png' },
  ]
  const out = substituteAttachmentMarkers('[image#1] [file#1] [image#2]', atts)
  assert.equal(out, '/tmp/img1.png /tmp/doc.txt /tmp/img2.png')
})

test('substituteAttachmentMarkers: unknown markers are left as-is', () => {
  const out = substituteAttachmentMarkers('[file#3] [image#9]', [
    { path: '/tmp/a.txt', name: 'a.txt', mime: 'text/plain' },
  ])
  assert.equal(out, '[file#3] [image#9]')
})

test('substituteAttachmentMarkers: no attachments is a no-op', () => {
  assert.equal(substituteAttachmentMarkers('plain text', []), 'plain text')
})

test('rewriteFailedAttachments: failed paths become [attach-failed: name]', () => {
  const out = rewriteFailedAttachments(
    'read /tmp/ok.txt and /tmp/bad.pdf now',
    [{ path: '/tmp/bad.pdf', name: 'bad.pdf' }],
  )
  assert.equal(out, 'read /tmp/ok.txt and [attach-failed: bad.pdf] now')
})

test('rewriteFailedAttachments: no failures is a no-op', () => {
  assert.equal(rewriteFailedAttachments('x /tmp/a', []), 'x /tmp/a')
})
