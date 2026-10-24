// CheckpointStore.restore() must report a failure, never THROW, when the
// working directory cannot even be used as a cwd for `tar`. The rewind path is
// documented as best-effort (create(): "a failed checkpoint must not abort the
// task it was meant to protect"), but `execFile` throws SYNCHRONOUSLY on a
// spawn error: a workdir replaced by a regular FILE (a script did `rm -rf` and
// `echo x > project`), or a permission/ENOENT on the shell, escaped runTar() as
// an uncaught exception out of /rewind — the operator's whole session died.
// The promise-based `runTar` never subscribed to the child's 'error' event.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { CheckpointStore } from '../src/checkpoint.ts'
import { makeTmpDir } from './tmp-dir.ts'

test('restore reports a failure when the workdir is not a directory', async (t) => {
  const dir = await makeTmpDir(t, 'zames-cp-tar-')
  const work = await makeTmpDir(t, 'zames-cp-work-')
  await fs.writeFile(path.join(work, 'a.txt'), 'v1')
  const store = new CheckpointStore({ dir, maxBackups: 5 })
  const rec = await store.create(work, 'one', false)
  assert.ok(rec, 'checkpoint was created')

  // Replace the project directory with a regular FILE.
  await fs.rm(work, { recursive: true, force: true })
  await fs.writeFile(work, 'not a dir')

  const res = await store
    .restore('1')
    .catch((e: Error) => ({ ok: false, reason: 'threw', detail: e.message }))
  assert.equal(res.ok, false, JSON.stringify(res))
  assert.ok(
    res.reason === 'backup_failed' ||
      res.reason === 'extract_failed' ||
      res.reason === 'copy_failed',
    'a machine reason is reported, got ' + String(res.reason),
  )
  await fs.rm(work, { force: true })
})

test('create reports no checkpoint when the workdir is not a directory', async (t) => {
  const dir = await makeTmpDir(t, 'zames-cp-tar2-')
  const work = await makeTmpDir(t, 'zames-cp-work2-')
  await fs.rm(work, { recursive: true, force: true })
  await fs.writeFile(work, 'not a dir')
  const store = new CheckpointStore({ dir, maxBackups: 5 })
  const rec = await store.create(work, 'one', false).catch(() => 'threw')
  assert.equal(rec, null, 'a failed checkpoint is null, not a throw')
  await fs.rm(work, { force: true })
})
