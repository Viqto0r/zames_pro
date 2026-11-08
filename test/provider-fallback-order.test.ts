import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickFallbackProvider } from '../src/provider-fallback.ts'

// provider-fallback.test.ts covers the rules one by one. These cases pin the
// ORDER and SHORT-CIRCUIT of the decision: the probe is only asked for a
// candidate that carries a marker, the first confirmed candidate wins, and a
// guest session never triggers a probe at all (a guest login check would be a
// live browser round-trip that cannot succeed).

const hasMarker = (raw: string, id: string): boolean =>
  raw
    .split(',')
    .map((s) => s.trim())
    .includes(id)

test('the probe is not called for a candidate without a marker', async () => {
  const probed: string[] = []
  const r = await pickFallbackProvider(
    'deepseek',
    [
      { id: 'qwen', guestAllowed: false, authMarker: '' },
      { id: 'glm', guestAllowed: false, authMarker: 'glm' },
    ],
    async (id) => {
      probed.push(id)
      return true
    },
    hasMarker,
  )
  assert.equal(r.provider, 'glm')
  assert.deepEqual(probed, ['glm'])
  assert.deepEqual(r.authorizable, ['qwen'])
})

test('the decision stops at the FIRST confirmed candidate', async () => {
  const probed: string[] = []
  const r = await pickFallbackProvider(
    'deepseek',
    [
      { id: 'qwen', guestAllowed: false, authMarker: 'qwen' },
      { id: 'glm', guestAllowed: false, authMarker: 'glm' },
    ],
    async (id) => {
      probed.push(id)
      return true
    },
    hasMarker,
  )
  assert.equal(r.provider, 'qwen')
  assert.deepEqual(probed, ['qwen'])
  assert.deepEqual(r.authorizable, [])
})

test('a guest session never reaches the login probe', async () => {
  const probed: string[] = []
  const r = await pickFallbackProvider(
    'deepseek',
    [
      {
        id: 'qwen',
        guestAllowed: true,
        guestSession: true,
        authMarker: 'qwen',
      },
    ],
    async (id) => {
      probed.push(id)
      return true
    },
    hasMarker,
  )
  assert.equal(r.provider, null)
  assert.deepEqual(probed, [])
  assert.deepEqual(r.authorizable, ['qwen'])
})

test('an empty candidate list is a plain null decision', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [],
    async () => true,
    hasMarker,
  )
  assert.deepEqual(r, { provider: null, authorizable: [] })
})

test('a dead marker falls through to the NEXT candidate', async () => {
  const r = await pickFallbackProvider(
    'deepseek',
    [
      { id: 'qwen', guestAllowed: false, authMarker: 'qwen' },
      { id: 'glm', guestAllowed: false, authMarker: 'glm' },
    ],
    async (id) => id === 'glm',
    hasMarker,
  )
  assert.equal(r.provider, 'glm')
  assert.deepEqual(r.authorizable, ['qwen'])
})
