import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { UndoStore } from '../src/undo.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `list(count)` promises `count` NEWEST records: `history.slice(-count)`.
// For `count = 0` that is `slice(-0)` = `slice(0)` — the WHOLE history, so a
// caller asking for ZERO rows (`/undo-list 0`, a paging loop that reached the
// end) got everything instead of nothing. A NEGATIVE count also reads from
// the END and returns rows.

test('list(0) returns no rows', async (t) => {
  const dir = await makeTmpDir(t, 'zames-undo-list-')
  const file = path.join(dir, 'a.txt')
  const store = new UndoStore()
  fs.writeFileSync(file, 'v1')
  await store.backup(file)
  // The index is APPEND-ONLY per path and capped by maxBackups: a fresh store
  // sees the records OTHER tests left in the shared ~/.zames/undo, so the
  // second backup must not assume the list is empty (with a cap of 1 the two
  // records collapse and `list(1)` was 0 when the global index was full).
  fs.writeFileSync(file, 'v2')
  await store.backup(file)
  store.maxBackups = 200
  assert.deepEqual(await store.list(0), [])
  assert.deepEqual(await store.list(-3), [])
  assert.equal((await store.list(1)).length, 1)
  assert.equal((await store.list(10)).length >= 1, true)
})
