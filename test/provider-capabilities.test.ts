import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROVIDERS,
  PROVIDER_IDS,
  providerHasModelPicker,
  providerGuestAllowed,
  providerProfileDir,
  providerConfigSection,
  providerChatUrl,
  providerChatIdRe,
} from '../src/providers.ts'
import { buildHandoffText, handoffFromLabel } from '../src/provider-handoff.ts'
import { authMarkerHas, mergeAuthMarker } from '../src/browser-pure.ts'
import {
  parseHeadlessUACache,
  mergeHeadlessUACache,
} from '../src/browser-pure.ts'

// The registry used to encode "there are exactly two backends" in a dozen
// `=== 'qwen'` checks. These tests pin the CAPABILITY contract instead, so a
// third provider (GLM) is a data entry, not a hunt for special cases.

test('three providers are registered and DeepSeek stays the default', () => {
  assert.deepEqual([...PROVIDER_IDS].sort(), ['deepseek', 'glm', 'qwen'])
  assert.equal(PROVIDERS.deepseek.isDefault, true)
  assert.equal(PROVIDER_IDS[0], 'deepseek')
})

test('hasModelPicker is a capability, not a provider name', () => {
  assert.equal(providerHasModelPicker('qwen'), true)
  assert.equal(providerHasModelPicker('glm'), true)
  assert.equal(providerHasModelPicker('deepseek'), false)
})

test('guestAllowed is declared per provider', () => {
  assert.equal(providerGuestAllowed('deepseek'), false)
  assert.equal(providerGuestAllowed('qwen'), true)
  assert.equal(providerGuestAllowed('glm'), true)
})

test('every provider owns a profile dir, a chat URL and an id matcher', () => {
  for (const id of PROVIDER_IDS) {
    assert.ok(providerProfileDir(id).includes('.zames'))
    assert.ok(providerChatUrl(id).startsWith('https://'))
    assert.ok(providerChatIdRe(id) instanceof RegExp)
  }
  assert.equal(providerProfileDir('glm'), PROVIDERS.glm.profileDir)
})

test('providerConfigSection is null for DeepSeek (its shared section)', () => {
  assert.equal(providerConfigSection('deepseek'), null)
  assert.equal(providerConfigSection('qwen'), 'qwen')
  assert.equal(providerConfigSection('glm'), 'glm')
})

test('handoffFromLabel prefers the explicit from field', () => {
  assert.equal(
    handoffFromLabel({
      provider: 'glm',
      from: 'qwen',
      workdir: '',
      summary: 's',
      createdAt: '',
    }),
    'Qwen',
  )
  // A legacy file (written with exactly two backends) has no `from`.
  assert.equal(
    handoffFromLabel({
      provider: 'qwen',
      workdir: '',
      summary: 's',
      createdAt: '',
    }),
    'DeepSeek',
  )
})

test('buildHandoffText names the real source and target', () => {
  const t = buildHandoffText({ from: 'Qwen', to: 'GLM', summary: 'x' })
  assert.ok(t.includes('Qwen -> GLM'))
})

test('the auth marker is per provider and migrates a legacy file', () => {
  const legacyDs = JSON.stringify({ at: '2026-01-01' })
  assert.equal(authMarkerHas(legacyDs, 'deepseek'), true)
  assert.equal(authMarkerHas(legacyDs, 'qwen'), false)
  const legacyQwen = JSON.stringify({ provider: 'qwen', at: '2026-01-01' })
  assert.equal(authMarkerHas(legacyQwen, 'qwen'), true)
  assert.equal(authMarkerHas(legacyQwen, 'deepseek'), false)

  let raw = mergeAuthMarker('', 'deepseek', 't1')
  raw = mergeAuthMarker(raw, 'glm', 't2')
  assert.equal(authMarkerHas(raw, 'deepseek'), true)
  assert.equal(authMarkerHas(raw, 'glm'), true)
  assert.equal(authMarkerHas(raw, 'qwen'), false)
})

test('the headless UA cache holds one entry per engine (no clobbering)', () => {
  let raw = mergeHeadlessUACache('', 'engineA', 'UA-A')
  raw = mergeHeadlessUACache(raw, 'engineB', 'UA-B')
  assert.equal(parseHeadlessUACache(raw, 'engineA'), 'UA-A')
  assert.equal(parseHeadlessUACache(raw, 'engineB'), 'UA-B')
  // A legacy single record still reads.
  const legacy = JSON.stringify({ engine: 'engineA', ua: 'UA-L' })
  assert.equal(parseHeadlessUACache(legacy, 'engineA'), 'UA-L')
  // A Headless UA is never reused.
  const bad = mergeHeadlessUACache('', 'engineC', 'HeadlessChrome/1')
  assert.equal(parseHeadlessUACache(bad, 'engineC'), null)
})
