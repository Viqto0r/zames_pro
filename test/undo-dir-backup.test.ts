import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { UndoStore } from '../src/undo.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `UndoStore.backup()` reads the target and rethrows anything except ENOENT.
// A DIRECTORY path (a `Write`/`Edit` whose `path` resolves to an existing
// directory — a typo, or a model that meant a file inside it) makes
// `fs.readFile` fail with EISDIR, and that error escaped the tool call: the
// operator saw a raw Node error instead of a tool result explaining the
// problem. A backup that cannot be taken must be reported as null, not thrown,
// for the same reason `CheckpointStore.create()` never throws.
test('backup on a directory returns null instead of throwing', async (t) => {
  const dir = await makeTmpDir(t, 'zames-undo-dir-')
  const store = new UndoStore()
  const res = await store.backup(dir)
  assert.equal(res, null)
})
