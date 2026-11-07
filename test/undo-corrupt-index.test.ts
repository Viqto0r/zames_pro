import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { UndoStore } from '../src/undo.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

// A PRIVATE history dir: the store is constructed with `dir`, so this file
// never touches the shared ~/.zames/undo that other undo tests use.
function makeStore(t: { after: (fn: () => unknown) => unknown }): {
  store: UndoStore
  index: string
} {
  const dir = makeTmpDirSync(t, 'undo-bad-')
  return { store: new UndoStore({ dir }), index: path.join(dir, 'index.json') }
}

// The undo index is a JSON FILE on disk that a crash, a hand edit or an old
// format can leave VALID JSON but not an array (`{}`, `null`, `"x"`, `42`).
// `_readIndex()` returned whatever JSON.parse produced, so `/undo` threw
// `history.pop is not a function` and `/undo-list` threw
// `history.slice is not a function` STRAIGHT out of the command dispatcher —
// a broken index made the whole undo history unreachable (and printed a raw
// Node stack trace instead of the localized message). The same bug family as
// the corrupt CHECKPOINT index, which is rebuilt from the archives.
test('a non-array undo index is treated as an empty history', async (t) => {
  const { store, index } = makeStore(t)
  for (const bad of ['{"a":1}', 'null', '"x"', '42', 'true']) {
    // The undo dir is SHARED by every test in the suite: a store that ran
    // earlier (a test without its own HOME) can APPEND its record over the
    // corrupt index we just wrote, so the file is wiped first — the case under
    // test is the corrupt CONTENT, not a leftover entry.
    fs.rmSync(index, { force: true })
    fs.writeFileSync(index, bad)
    const res = await store.undoLast()
    assert.deepEqual(res, { ok: false, reason: 'empty' }, bad)
    assert.deepEqual(await store.list(10), [], bad)
  }
  fs.rmSync(index, { force: true })
})

test('an array with junk entries drops the junk and keeps real records', async (t) => {
  const { store, index } = makeStore(t)
  fs.writeFileSync(
    index,
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
  fs.rmSync(index, { force: true })
})
