import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDataUrl, parseImagePaste } from '../src/attachments.ts'

// `parseDataUrl` never fails: a `data:` URL whose base64 payload is EMPTY or
// invalid still returns `{mime, data: Buffer.alloc(0)}`. That object is truthy,
// so the paste handler treated it as a real attachment: an `[image#1]` marker
// appeared for a ZERO-byte image, `saveToTemp` wrote an empty file and the
// turn was submitted with a broken attachment.
test('parseDataUrl: an empty base64 payload is not an attachment', () => {
  assert.equal(parseDataUrl('data:image/png;base64,'), null)
  assert.equal(parseDataUrl('data:image/png;base64,!!!!'), null)
})

test('parseImagePaste: an empty payload is not an image', () => {
  assert.equal(parseImagePaste('data:image/png;base64,'), null)
})

test('parseDataUrl: a real payload still parses', () => {
  const b64 = Buffer.from('hello').toString('base64')
  const r = parseDataUrl('data:text/plain;base64,' + b64)
  assert.ok(r)
  assert.equal(r?.mime, 'text/plain')
  assert.equal(r?.data.toString(), 'hello')
})
