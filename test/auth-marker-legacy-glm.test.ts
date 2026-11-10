import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { authMarkerHas, mergeAuthMarker } from '../src/browser-pure.ts'
import { writeFileAtomic } from '../src/fsutil.ts'
import { makeTmpDirSync } from './tmp-dir.ts'

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

// The auth marker shares ~/.zames with the config but was written with a plain
// fs.writeFile, so it landed with the default umask (0644) — readable by every
// user on a shared machine, right next to a 0600 config. It must go through
// the atomic 0600 writer like every other state file in ~/.zames.
test('writeFileAtomic creates the state file 0600', (t) => {
  const dir = makeTmpDirSync(t, 'zames-authmode-')
  const file = path.join(dir, 'auth.json')
  writeFileAtomic(file, JSON.stringify({ providers: { qwen: { at: 'x' } } }))
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
})
