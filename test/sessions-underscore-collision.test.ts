// Session ids are chat ids from a URL/DOM: they may contain `_`, which
// `safeName()` uses as its escape character. The comment promised `_` -> `_5f`,
// but only OTHER unsafe characters were encoded, so a plain `_` survived as
// itself: `a_b` and `a` + a character encoded as `_5f` + `b` mapped to the SAME
// file name and one session silently overwrote the other.

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
  const home = await makeTmpDir(t, 'zames-sess-')
  const prevHome = process.env.HOME
  process.env.HOME = home
  try {
    const mod = await import(
      '../src/sessions.ts?t=' + Date.now() + Math.random()
    )
    await fn(mod)
  } finally {
    process.env.HOME = prevHome
  }
}

test('an underscore in a chat id does not collide with an encoded one', async (t) => {
  await withFreshSessions(t, async (mod) => {
    // `a_b` keeps its underscore; `a/b` encodes `/` as `_2f`. With the
    // underscore left unescaped the FIRST would be written to `a_b.json` and
    // the SECOND to `a_2fb.json` -- no collision there, so pick the pair that
    // DOES collide: `a_2fb` (literal) vs `a/b` (encoded `a_2fb`).
    mod.saveSession({ id: 'a_2fb', title: 'literal', workdir: '/p' })
    mod.saveSession({ id: 'a/b', title: 'encoded', workdir: '/p' })
    const list = mod.listSessions()
    assert.equal(list.length, 2, 'both sessions must survive')
    const titles = list.map((s) => s.title).sort()
    assert.deepEqual(titles, ['encoded', 'literal'])
  })
})
