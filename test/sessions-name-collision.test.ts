// Session ids are provider chat ids, but they come from a URL/DOM and are not
// guaranteed to be purely [A-Za-z0-9_.-]. `safeName()` REPLACED every other
// character with `_`, so two DIFFERENT ids ('a/b' and 'a_b') collided on the
// SAME <id>.json: the second save overwrote the first and `/sessions` listed
// only one of them — the other chat could not be resumed at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'

// The module resolves ~/.zames/.sessions at import time from HOME, so each test
// gets its own HOME and a FRESH module instance.
async function withFreshSessions(
  t: { after: (fn: () => unknown) => unknown },
  fn: (mod: typeof import('../src/sessions.ts')) => Promise<void>,
): Promise<void> {
  const home = await makeTmpDir(t, 'zames-sess-')
  const prevHome = process.env.HOME
  process.env.HOME = home
  try {
    const mod = await import(
      '../src/sessions.ts?fresh=' + Math.random().toString(36).slice(2)
    )
    await fn(mod)
  } finally {
    process.env.HOME = prevHome
  }
}

test('two ids that sanitize alike are stored separately', async (t) => {
  await withFreshSessions(t, async (mod) => {
    mod.saveSession({ id: 'a/b', title: 'first', workdir: '/w' })
    mod.saveSession({ id: 'a_b', title: 'second', workdir: '/w' })
    const ids = mod
      .listSessions()
      .map((s) => s.id)
      .sort()
    assert.deepEqual(ids, ['a/b', 'a_b'])
    assert.equal(mod.readSession('a/b')?.title, 'first')
    assert.equal(mod.readSession('a_b')?.title, 'second')
  })
})

test('the same id always maps to the same file', async (t) => {
  await withFreshSessions(t, async (mod) => {
    mod.saveSession({ id: 'x:y', title: 'one', workdir: '/w' })
    mod.saveSession({ id: 'x:y', title: 'two', workdir: '/w' })
    assert.equal(mod.listSessions().length, 1)
    assert.equal(mod.readSession('x:y')?.title, 'two')
  })
})
