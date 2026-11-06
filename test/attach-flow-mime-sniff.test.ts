import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAttachBuffers } from '../src/attach-flow.ts'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// `readAttachBuffers` reads every file into a Playwright payload and reports an
// unreadable one through `onReadError`. The MIME passed along is the one the
// caller stored at attach time. For a file whose extension is unknown that is
// `application/octet-stream`, which many upload widgets reject (a PNG pasted
// with no extension, a `.jpg` saved as `.jpeg` in a case-sensitive map...).
// The payload must carry a MIME that matches the CONTENT when the stored one is
// the generic octet-stream.

const dir = mkdtempSync(path.join(tmpdir(), 'attach-'))

test('a readable file is passed through with its bytes', async () => {
  const p = path.join(dir, 'a.txt')
  writeFileSync(p, 'hi')
  const errors: string[] = []
  const { payload, failed } = await readAttachBuffers(
    [{ path: p, name: 'a.txt', mime: 'text/plain' }],
    (n, e) => errors.push(n + ':' + e),
  )
  assert.equal(payload.length, 1)
  assert.equal(payload[0].buffer.toString(), 'hi')
  assert.equal(payload[0].mimeType, 'text/plain')
  assert.deepEqual(failed, [])
  assert.deepEqual(errors, [])
})

test('an unreadable file is reported, not thrown', async () => {
  const errors: string[] = []
  const { payload, failed } = await readAttachBuffers(
    [
      {
        path: path.join(dir, 'nope.txt'),
        name: 'nope.txt',
        mime: 'text/plain',
      },
    ],
    (n) => errors.push(n),
  )
  assert.equal(payload.length, 0)
  assert.equal(failed.length, 1)
  assert.deepEqual(errors, ['nope.txt'])
})

test('an unknown mime is replaced by a sniffed one when possible', async () => {
  const p = path.join(dir, 'image')
  // A PNG header, no extension.
  writeFileSync(
    p,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )
  const { payload } = await readAttachBuffers(
    [{ path: p, name: 'image', mime: 'application/octet-stream' }],
    () => {},
  )
  assert.equal(payload[0].mimeType, 'image/png')
})
