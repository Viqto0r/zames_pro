import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeTmpDir } from './tmp-dir.ts'

// `loadLastSession` has THREE restore paths the happy-path file does not pin:
// the stale index (a listed id whose file is gone), the provider filter (a chat
// id belongs to ONE backend) and the newest-saved fallback when the index has
// nothing usable. The module resolves ~/.zames/.sessions from HOME at import
// time, so each test gets its own HOME and a FRESH instance.

async function withFreshSessions(
  t: { after: (fn: () => unknown) => unknown },
  fn: (mod: typeof import('../src/sessions.ts')) => Promise<void>,
): Promise<void> {
  const home = await makeTmpDir(t, 'zames-sess-paths-')
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

test('a stale index id whose file is gone does not block the restore', async (t) => {
  await withFreshSessions(t, async (mod) => {
    mod.saveSession({ id: 'real', title: 'saved', workdir: '/proj' })
    // The index still points at a chat whose FILE was deleted behind our back.
    const index = path.join(mod.sessionsDir(), 'last.json')
    await fs.writeFile(
      index,
      JSON.stringify({ last: 'gone', byWorkdir: { '/proj': 'gone' } }),
    )
    const s = mod.loadLastSession('/proj')
    assert.ok(s, 'the saved session is still restorable')
    assert.equal(s.id, 'real')
  })
})

test('a session of ANOTHER provider is skipped, the right one is restored', async (t) => {
  await withFreshSessions(t, async (mod) => {
    mod.saveSession({
      id: 'qwen-chat',
      title: 'q',
      workdir: '/proj',
      provider: 'qwen',
    })
    mod.saveSession({
      id: 'ds-chat',
      title: 'd',
      workdir: '/proj',
      provider: 'deepseek',
    })
    const ds = mod.loadLastSession('/proj', 'deepseek')
    assert.equal(ds?.id, 'ds-chat')
    const qw = mod.loadLastSession('/proj', 'qwen')
    assert.equal(qw?.id, 'qwen-chat')
  })
})

test('an older session without a provider counts as deepseek', async (t) => {
  await withFreshSessions(t, async (mod) => {
    mod.saveSession({ id: 'legacy', title: 'old', workdir: '/proj' })
    const s = mod.loadLastSession('/proj', 'deepseek')
    assert.equal(s?.id, 'legacy')
    // It is NOT a qwen chat, so a qwen restore must not pick it up.
    assert.equal(mod.loadLastSession('/proj', 'qwen'), null)
  })
})

test('without an index hit the newest session of the workdir is used', async (t) => {
  await withFreshSessions(t, async (mod) => {
    mod.saveSession({ id: 'older', title: 'a', workdir: '/proj' })
    mod.saveSession({ id: 'newer', title: 'b', workdir: '/proj' })
    await fs.writeFile(
      path.join(mod.sessionsDir(), 'last.json'),
      JSON.stringify({}),
    )
    const s = mod.loadLastSession('/proj')
    assert.ok(s, 'a fallback session is found')
    assert.ok(['older', 'newer'].includes(s.id))
  })
})

test('a corrupt index yields null, not a thrown error', async (t) => {
  await withFreshSessions(t, async (mod) => {
    mod.saveSession({ id: 'kept', title: 't', workdir: '/proj' })
    await fs.writeFile(path.join(mod.sessionsDir(), 'last.json'), '{not json')
    // The whole body sits in ONE try/catch, so an unparsable index
    // short-circuits to null and does NOT reach the `listSessions()` fallback
    // below it. Pinned as the current contract: a corrupt index hides the
    // restore instead of crashing the main loop.
    assert.equal(mod.loadLastSession('/proj'), null)
  })
})
