// /undo-list prints `new Date(r.stamp).toLocaleString()`. A record from an
// older format (no `stamp`) or a hand-edited index (`stamp: "oops"`) prints
// the literal `Invalid Date` for the whole row — the operator sees a broken
// line instead of the file that can actually be reverted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.js'

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await makeTmpDir(
    { after: (cb: () => void) => process.on('exit', cb) } as never,
    'zames-undo-date-',
  )
  const real = process.env.HOME
  process.env.HOME = home
  try {
    return await fn(home)
  } finally {
    if (real === undefined) delete process.env.HOME
    else process.env.HOME = real
  }
}

test('a record without a stamp still yields a usable date line', async () => {
  await withHome(async (home) => {
    fs.mkdirSync(path.join(home, '.zames', 'undo'), { recursive: true })
    fs.writeFileSync(
      path.join(home, '.zames', 'undo', 'index.json'),
      JSON.stringify([
        { originalPath: '/x/a.ts', existed: true, backupFile: null },
      ]),
    )
    const { undoDateLabel } = await import('../src/undo.ts')
    const label = undoDateLabel(undefined)
    assert.ok(!label.includes('Invalid'), 'got: ' + label)
  })
})

test('a real stamp formats as a date (control)', async () => {
  const { undoDateLabel } = await import('../src/undo.ts')
  const label = undoDateLabel(Date.now())
  assert.ok(!label.includes('Invalid'))
})
