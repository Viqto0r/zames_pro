// saveToTemp() names a staged attachment after the original file, capped at 80
// characters. The cap cut the WHOLE sanitized name, so a long file name lost
// its extension: the temp file became `xxxx…` with no `.png`, and every later
// step that looks at the extension (guessMime, isImageName, the provider's
// upload dialog) saw a plain blob instead of an image.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.js'
import { saveToTemp } from '../src/attachments.js'

test('a long file name keeps its extension in the temp path', async (t) => {
  const dir = await makeTmpDir(t, 'zames-save-temp-')
  const name = 'x'.repeat(120) + '.png'
  const p = await saveToTemp(dir, name, Buffer.from('data'))
  assert.equal(path.extname(p), '.png', 'extension lost: ' + path.basename(p))
  assert.ok(path.basename(p).length <= 80)
  assert.ok(fs.existsSync(p))
})

test('a short name is unchanged (control)', async (t) => {
  const dir = await makeTmpDir(t, 'zames-save-temp2-')
  const p = await saveToTemp(dir, 'photo.png', Buffer.from('data'))
  assert.equal(path.basename(p), 'photo.png')
})
