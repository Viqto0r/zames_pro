import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { UndoStore } from '../src/undo.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

const UNDO_DIR = path.join(os.homedir(), '.zames', 'undo')
const INDEX = path.join(UNDO_DIR, 'index.json')

// The undo index is a JSON FILE on disk that a crash, a hand edit or an old
// format can leave VALID JSON but not an array (`{}`, `null`, `"x"`, `42`).
// `_readIndex()` returned whatever JSON.parse produced, so `/undo` threw
// `history.pop is not a function` and `/undo-list` threw
// `history.slice is not a function` STRAIGHT out of the command dispatcher —
// a broken index made the whole undo history unreachable (and printed a raw
// Node stack trace instead of the localized message). The same bug family as
// the corrupt CHECKPOINT index, which is rebuilt from the archives.
test('a non-array undo index is treated as an empty history', async (t) => {
  makeTmpDirSync(t, 'undo-bad')
  fs.mkdirSync(UNDO_DIR, { recursive: true })
  const store = new UndoStore()
  for (const bad of ['{"a":1}', 'null', '"x"', '42', 'true']) {
    fs.writeFileSync(INDEX, bad)
    const res = await store.undoLast()
    assert.deepEqual(res, { ok: false, reason: 'empty' }, bad)
    assert.deepEqual(await store.list(10), [], bad)
  }
  fs.rmSync(INDEX, { force: true })
})

test('an array with junk entries drops the junk and keeps real records', async (t) => {
  makeTmpDirSync(t, 'undo-junk')
  fs.mkdirSync(UNDO_DIR, { recursive: true })
  const store = new UndoStore()
  fs.writeFileSync(
    INDEX,
    JSON.stringify([
      null,
      42,
      { originalPath: null, existed: true, stamp: 1, backupFile: null },
      { originalPath: '/tmp/x', existed: false, stamp: 2, backupFile: null },
    ]),
  )
  const list = await store.list(10)
  assert.equal(list.length, 1)
  assert.equal(list[0].originalPath, '/tmp/x')
  fs.rmSync(INDEX, { force: true })
})
