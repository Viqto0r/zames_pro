import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Transcript } from '../src/transcript.ts'

// `sessionName` is the working-directory LABEL. It is sanitized for path
// separators, but NOT for LENGTH: a deeply nested project path (or a long
// label) produced a file name over the filesystem's 255-byte limit, and the
// stream failed with ENAMETOOLONG — the transcript was silently disabled and
// the whole run had no log (the `error` handler only printed a line).
const root = path.resolve('tmp', 'tr-long-' + process.pid)

test('a very long session name still yields a transcript', async () => {
  fs.rmSync(root, { recursive: true, force: true })
  const t = new Transcript({ dir: root, sessionName: 'n'.repeat(500) })
  t.log('probe', { v: 1 })
  await t.close()
  try {
    assert.equal(t.enabled, true, 'the transcript was disabled')
    assert.ok(t.file, 'no file name')
    assert.equal(fs.existsSync(t.file as string), true)
    assert.ok(
      path.basename(t.file as string).length <= 255,
      'name too long: ' + path.basename(t.file as string).length,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
