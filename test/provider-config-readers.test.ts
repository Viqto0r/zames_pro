import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  providerConfigSection,
  providerChatUrlPrefix,
  PROVIDER_IDS,
} from '../src/providers.ts'

// src/index.ts reads the ACTIVE provider's timing/model from its OWN config
// section through providerConfigSection(). The index helpers are private and
// the module cannot be imported (it boots main()), so the CONTRACT they rely on
// is pinned at the registry level: DeepSeek owns the shared `browser` section
// (null here), Qwen/GLM own `qwen`/`glm`, and every provider has a chat prefix.
// A wrong mapping silently gives a NEW backend the DeepSeek timings.

test('every provider id is unique and lower-case', () => {
  assert.equal(new Set(PROVIDER_IDS).size, PROVIDER_IDS.length)
  for (const id of PROVIDER_IDS) assert.match(id, /^[a-z]+$/)
})

test('DeepSeek has NO own section: it shares the browser one', () => {
  assert.equal(providerConfigSection('deepseek'), null)
})

test('Qwen and GLM own their own config sections', () => {
  assert.equal(providerConfigSection('qwen'), 'qwen')
  assert.equal(providerConfigSection('glm'), 'glm')
})

test('the section id equals the provider id for a sectioned backend', () => {
  for (const id of PROVIDER_IDS) {
    const s = providerConfigSection(id)
    if (s !== null) assert.equal(s, id)
  }
})

test('every provider has a chat URL prefix', () => {
  for (const id of PROVIDER_IDS) {
    const url = providerChatUrlPrefix(id)
    assert.match(url, /^https:\/\/[^\s]+$/, id + ' prefix is a bare url')
  }
})

test('the prefixes point at the three different sites', () => {
  const urls = PROVIDER_IDS.map((id) => providerChatUrlPrefix(id))
  assert.equal(new Set(urls).size, urls.length)
  assert.ok(urls.some((u) => u.includes('deepseek')))
  assert.ok(urls.some((u) => u.includes('qwen')))
  assert.ok(urls.some((u) => u.includes('z.ai')))
})

test('an unknown provider has no prefix (no broken link is built)', () => {
  assert.equal(providerChatUrlPrefix('nope'), '')
})
