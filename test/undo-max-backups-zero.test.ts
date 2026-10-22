import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { UndoStore } from '../src/undo.ts'
import { makeTmpDir } from './tmp-dir.ts'

// `backup()` trims the history with `while (history.length > maxBackups)`.
// With `maxBackups: 0` (the config allows 0 — `/config set undo.maxBackups 0`
// is a legitimate way to disable the feature) the loop pushes the record and
// then immediately shifts it out AND unlinks its `.bak` file, so /undo has
// nothing to revert while the operator was told the backup happened.
test('backup with maxBackups=0 does not claim a backup it throws away', async (t) => {
  const dir = await makeTmpDir(t, 'zames-undo0-')
  const file = path.join(dir, 'a.txt')
  await fs.writeFile(file, 'v1')
  const store = new UndoStore({ maxBackups: 0 })
  const rec = await store.backup(file)
  await fs.writeFile(file, 'v2')
  const res = await store.undoLast()
  // Either the backup is really usable (content restored) or backup() must
  // NOT report a record. Silently dropping it breaks both promises.
  if (rec) {
    assert.equal(
      res.ok,
      true,
      'backup() reported a record but /undo found none',
    )
    assert.equal(await fs.readFile(file, 'utf-8'), 'v1')
  }
})
