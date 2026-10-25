import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readAttachBuffers, awaitUploadPreview } from '../src/attach-flow.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

// The SHARED attachment plumbing (src/attach-flow.ts): file reading (with a
// per-file failed list) and the upload-preview wait. Both providers delegate
// here so their `_attachFiles` implementations cannot drift apart.
// (The AttachmentStore/temp-file tests live in test/attach-flow.test.ts.)

test('readAttachBuffers reads files and reports failures without throwing', async (t) => {
  const dir = makeTmpDirSync(t, 'zames-af-')
  const okPath = path.join(dir, 'ok.txt')
  fs.writeFileSync(okPath, 'hello')
  const errors: string[] = []
  const { payload, failed } = await readAttachBuffers(
    [
      { path: okPath, name: 'ok.txt', mime: 'text/plain' },
      {
        path: path.join(dir, 'missing.txt'),
        name: 'missing.txt',
        mime: 'text/plain',
      },
    ],
    (name, error) => errors.push(name + ':' + error),
  )
  assert.equal(payload.length, 1)
  assert.equal(payload[0].name, 'ok.txt')
  assert.equal(payload[0].buffer.toString(), 'hello')
  assert.deepEqual(failed, [
    { path: path.join(dir, 'missing.txt'), name: 'missing.txt' },
  ])
  assert.equal(errors.length, 1)
  assert.ok(errors[0].startsWith('missing.txt:'))
})

test('readAttachBuffers with no files returns empty structures', async () => {
  const { payload, failed } = await readAttachBuffers([], () => {})
  assert.deepEqual(payload, [])
  assert.deepEqual(failed, [])
})

// A fake page whose waitForTimeout advances a VIRTUAL clock, so the tests can
// assert how long the wait took without sleeping.
function fakePage(visible: Set<string>) {
  let now = 0
  return {
    async waitForTimeout(ms: number) {
      now += ms
    },
    getByText(text: string) {
      return {
        async count() {
          return visible.has(text) ? 1 : 0
        },
      }
    },
    get _now() {
      return now
    },
  }
}

test('awaitUploadPreview returns as soon as a name is visible', async () => {
  const page = fakePage(new Set(['file.png']))
  await awaitUploadPreview(page as never, ['file.png'], 5000)
  assert.equal(page._now, 0)
})

test('awaitUploadPreview waits out the full timeout when nothing appears', async () => {
  const page = fakePage(new Set())
  await awaitUploadPreview(page as never, ['never.png'], 300)
  // The loop advanced past the deadline (a multiple of the 150ms tick).
  assert.ok(page._now >= 300)
})

test('awaitUploadPreview falls back to a plain sleep with no names', async () => {
  const page = fakePage(new Set())
  await awaitUploadPreview(page as never, [], 250)
  assert.equal(page._now, 250)
})
