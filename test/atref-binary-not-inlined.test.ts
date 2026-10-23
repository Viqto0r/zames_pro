// `@file` references are inlined into the task text. A BINARY file (an image,
// an archive, a compiled blob) was read as UTF-8 and pasted into the prompt:
// the model received replacement characters and NUL bytes instead of a usable
// reference, and the file was counted as "inlined" so the operator saw it in
// the notice. The Read tool already answers a binary file with metadata — the
// inliner must do the same instead of dumping the bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.js'
import { inlineAtRefs } from '../src/attach-refs.js'

test('a binary @ref is not inlined as text', async (t) => {
  const dir = await makeTmpDir(t, 'zames-atref-bin-')
  const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff])
  fs.writeFileSync(path.join(dir, 'pic.png'), bin)

  const res = await inlineAtRefs(dir, 'look at @pic.png please')
  assert.ok(
    !res.text.includes('\u0000'),
    'NUL bytes leaked into the prompt: ' + JSON.stringify(res.text),
  )
  assert.equal(res.inlined.length, 0, 'a binary file was reported as inlined')
})

test('a text @ref is still inlined (control)', async (t) => {
  const dir = await makeTmpDir(t, 'zames-atref-txt-')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\n')
  const res = await inlineAtRefs(dir, 'look at @a.txt')
  assert.deepEqual(res.inlined, ['a.txt'])
  assert.ok(res.text.includes('hello'))
})
