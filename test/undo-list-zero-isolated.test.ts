import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeTmpDirSync } from './tmp-dir.ts'

// `list(count)` promises `count` NEWEST records: `history.slice(-count)`.
// For `count = 0` that is `slice(-0)` = `slice(0)` — the WHOLE history, so a
// caller asking for ZERO rows (`/undo-list 0`, a paging loop that reached the
// end) got everything instead of nothing. A NEGATIVE count also reads from the
// END and returns rows.
//
// WHY a CHILD PROCESS: `src/undo.ts` resolves `~/.zames/undo` at IMPORT time
// (`os.homedir()`), and the whole suite shares one HOME. A test that imports
// UndoStore in-process therefore fights every other `undo*`/`checkpoint*` file
// over ONE index.json: this very test failed only in the full run ("0 !== 1")
// while passing alone. The child gets its OWN throwaway HOME, so the index is
// private — and the parent never imports the module at all.

const SCRIPT = `
import { UndoStore } from './src/undo.ts'
import fs from 'node:fs'
import path from 'node:path'

const dir = process.env.UNDO_TEST_DIR
const file = path.join(dir, 'a.txt')
const store = new UndoStore()
store.maxBackups = 200
fs.writeFileSync(file, 'v1')
await store.backup(file)
fs.writeFileSync(file, 'v2')
await store.backup(file)
store.maxBackups = 200
const zero = await store.list(0)
const negative = await store.list(-3)
const one = await store.list(1)
const ten = await store.list(10)
console.log(JSON.stringify({
  zero: zero.length,
  negative: negative.length,
  one: one.length,
  ten: ten.length,
}))
`

test('list(0) returns no rows, with a private HOME', async (t) => {
  const root = makeTmpDirSync(t, 'undo-iso-')
  const home = path.join(root, 'home')
  const work = path.join(root, 'work')
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(work, { recursive: true })
  const script = path.join(root, 'run.mts')
  fs.writeFileSync(script, SCRIPT, 'utf-8')

  const { spawnSync } = await import('node:child_process')
  const r = spawnSync('npx', ['tsx', script], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      UNDO_TEST_DIR: work,
    },
    timeout: 120_000,
  })
  assert.equal(r.status, 0, 'child failed: ' + (r.stderr || '').slice(-2000))
  const out = JSON.parse(
    String(r.stdout).trim().split(String.fromCharCode(10)).pop() as string,
  )
  assert.deepEqual(out, { zero: 0, negative: 0, one: 1, ten: 2 })
})
