// The persisted input history lives in ~/.zames/history.json. saveHistory()
// caps what IT writes, but loadHistory() trusted the file: a history from an
// older build, a hand-edited file or a partially-merged one was loaded in
// FULL into the editor (memory) and — worse — the next save would then write
// that whole array back out, so the cap never took effect again.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'

async function withFreshSessions(
  t: { after: (fn: () => unknown) => unknown },
  fn: (mod: typeof import('../src/sessions.ts')) => Promise<void>,
): Promise<void> {
  const home = await makeTmpDir(t, 'zames-hist-')
  const prev = process.env.HOME
  process.env.HOME = home
  try {
    const mod = await import(
      '../src/sessions.ts?fresh=' + Math.random().toString(36).slice(2)
    )
    await fn(mod)
  } finally {
    process.env.HOME = prev
  }
}

test('loadHistory caps an oversized history file', async (t) => {
  await withFreshSessions(t, async (mod) => {
    const dir = path.join(process.env.HOME as string, '.zames')
    await fs.mkdir(dir, { recursive: true })
    const big = Array.from({ length: 5000 }, (_, i) => 'cmd' + i)
    await fs.writeFile(path.join(dir, 'history.json'), JSON.stringify(big))
    const loaded = mod.loadHistory()
    assert.equal(loaded.length, 500)
    // The MOST RECENT entries are kept (the tail of the file).
    assert.equal(loaded[loaded.length - 1], 'cmd4999')
    assert.equal(loaded[0], 'cmd4500')
  })
})

test('loadHistory still drops non-string entries', async (t) => {
  await withFreshSessions(t, async (mod) => {
    const dir = path.join(process.env.HOME as string, '.zames')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'history.json'),
      JSON.stringify(['ok', 42, null, 'fine']),
    )
    assert.deepEqual(mod.loadHistory(), ['ok', 'fine'])
  })
})
