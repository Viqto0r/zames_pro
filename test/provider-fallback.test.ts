import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickFallbackProvider } from '../src/provider-fallback.ts'

// N8: the fallback-provider choice. The rules are the whole point: a guest
// tier is never a fallback, a marker without a live session is not usable, and
// the failure path names which providers CAN be authorized.

const hasMarker = (raw: string, id: string): boolean =>
  raw
    .split(',')
    .map((s) => s.trim())
    .includes(id)
const probe =
  (ok: string[]) =>
  async (id: string): Promise<boolean> =>
    ok.includes(id)

// Guest-capable providers: `guestSession` says whether THIS session is a guest.
const qwen = {
  id: 'qwen' as const,
  guestAllowed: true,
  guestSession: true,
  authMarker: '',
}
const glm = {
  id: 'glm' as const,
  guestAllowed: true,
  guestSession: false,
  authMarker: '',
}

test('a guest-only provider is never a fallback', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [qwen, glm],
    probe([]),
    hasMarker,
  )
  assert.equal(r.provider, null)
  // Neither is usable NOW (qwen is a guest, glm is signed out), but BOTH can be
  // authorized by signing in, so the failure message can name them.
  assert.deepEqual(r.authorizable, ['qwen', 'glm'])
})

test('a marker plus a live login makes the candidate usable', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [{ ...glm, authMarker: 'glm' }, qwen],
    probe(['glm']),
    hasMarker,
  )
  assert.equal(r.provider, 'glm')
})

test('a marker whose session is dead is not used mid-task', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [{ ...glm, authMarker: 'glm' }],
    probe([]),
    hasMarker,
  )
  assert.equal(r.provider, null)
  // It is authorizable: the operator can renew the session.
  assert.deepEqual(r.authorizable, ['glm'])
})

test('the active provider is skipped', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [{ id: 'deepseek', guestAllowed: false, authMarker: 'deepseek' }],
    probe(['deepseek']),
    hasMarker,
  )
  assert.equal(r.provider, null)
})

test('a signed-in provider without a marker is listed as authorizable', async () => {
  const r = await pickFallbackProvider('deepseek', [glm], probe([]), hasMarker)
  assert.equal(r.provider, null)
  assert.deepEqual(r.authorizable, ['glm'])
})

test('a throwing probe is treated as not logged in', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [{ ...glm, authMarker: 'glm' }],
    async () => {
      throw new Error('page gone')
    },
    hasMarker,
  )
  assert.equal(r.provider, null)
})

test('the FIRST usable candidate wins', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [
      { ...qwen, authMarker: 'qwen' },
      { ...glm, authMarker: 'glm' },
    ],
    probe(['qwen', 'glm']),
    hasMarker,
  )
  // qwen is guestAllowed, so it is skipped; glm wins.
  assert.equal(r.provider, 'glm')
})
