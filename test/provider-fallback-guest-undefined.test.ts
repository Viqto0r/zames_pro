import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickFallbackProvider } from '../src/provider-fallback.ts'

// `guestSession` is OPTIONAL: an older caller that predates the field passes a
// candidate with `guestAllowed: true` and no `guestSession` at all. The code
// treated `undefined` as "a guest session", so a signed-in provider WITH a
// valid marker and a LIVE session was never probed and never chosen as a
// fallback — the switch silently refused to happen mid-task.
const hasMarker = (raw: string, id: string): boolean =>
  raw
    .split(',')
    .map((s) => s.trim())
    .includes(id)

test('a guest-CAPABLE provider without the flag is still probed', async () => {
  const qwen = { id: 'qwen' as const, guestAllowed: true, authMarker: 'qwen' }
  let probed = 0
  const r = await pickFallbackProvider(
    'deepseek',
    [qwen],
    async () => {
      probed++
      return true
    },
    hasMarker,
  )
  assert.equal(probed, 1, 'the provider was never probed')
  assert.equal(r.provider, 'qwen')
})

test('an explicit guest session is still skipped', async () => {
  const qwen = {
    id: 'qwen' as const,
    guestAllowed: true,
    guestSession: true,
    authMarker: 'qwen',
  }
  const r = await pickFallbackProvider(
    'deepseek',
    [qwen],
    async () => true,
    hasMarker,
  )
  assert.equal(r.provider, null)
  assert.deepEqual(r.authorizable, ['qwen'])
})
