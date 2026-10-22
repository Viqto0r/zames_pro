import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { looksLikeFilePath } from '../src/attachments.ts'
import { resolveAttachPath } from '../src/attach-refs.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

// A pasted URL is not a file path. `looksLikeFilePath` accepts any single
// token containing `/` and ending in a short extension, so
// `https://example.com/a.png` passed the check and `resolveAttachPath` then
// resolved it as a RELATIVE path — `path.resolve(workdir, 'https://…')`
// collapses the double slash into `https:/…`. If a project happens to contain
// such a directory (or `https:` exists for another reason) the URL was
// silently attached as a local file, and the model received a `[file#N]`
// marker instead of the URL text. A URL must never be treated as a path.
test('looksLikeFilePath rejects a URL', () => {
  assert.equal(looksLikeFilePath('https://example.com/a.png'), false)
  assert.equal(looksLikeFilePath('http://example.com/a.png'), false)
  assert.equal(looksLikeFilePath('see https://example.com/a.png'), false)
  // A normal path still passes.
  assert.equal(looksLikeFilePath('/tmp/a.png'), true)
  assert.equal(looksLikeFilePath('tmp/a.png'), true)
})

test('resolveAttachPath does not turn a URL into a local file', async (t) => {
  const dir = makeTmpDirSync(t, 'wk')
  // Build the misleading tree `https:/example.com/a.png` INSIDE the project.
  fs.mkdirSync(path.join(dir, 'https:', 'example.com'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'https:', 'example.com', 'a.png'), 'x')
  assert.equal(await resolveAttachPath(dir, 'https://example.com/a.png'), null)
})
