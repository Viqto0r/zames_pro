import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authMarkerHas, mergeAuthMarker } from '../src/browser-pure.ts'

// A LEGACY marker (`{provider:'qwen', at}`) is migrated into the per-provider
// map on the next write. The migration knew only Qwen and "everything else is
// DeepSeek": a legacy GLM record was filed under `deepseek`, so after the
// migration /doctor and the banner claimed a DeepSeek session while the GLM
// one had disappeared (and the DeepSeek entry was a lie).
test('a legacy GLM marker is not migrated to deepseek', () => {
  const legacy = JSON.stringify({ provider: 'glm', at: '2026-01-01T00:00:00Z' })
  const merged = mergeAuthMarker(legacy, 'qwen', '2026-02-02T00:00:00Z')
  assert.equal(authMarkerHas(merged, 'glm'), true)
  assert.equal(authMarkerHas(merged, 'qwen'), true)
  assert.equal(authMarkerHas(merged, 'deepseek'), false)
})

test('legacy qwen and bare deepseek records still migrate', () => {
  const qwen = mergeAuthMarker(
    JSON.stringify({ provider: 'qwen', at: 'x' }),
    'glm',
    'y',
  )
  assert.equal(authMarkerHas(qwen, 'qwen'), true)
  assert.equal(authMarkerHas(qwen, 'glm'), true)
  const ds = mergeAuthMarker(JSON.stringify({ at: 'x' }), 'glm', 'y')
  assert.equal(authMarkerHas(ds, 'deepseek'), true)
  assert.equal(authMarkerHas(ds, 'glm'), true)
})
