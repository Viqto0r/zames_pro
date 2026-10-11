import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROVIDERS,
  PROVIDER_IDS,
  isProviderId,
  asProviderId,
  providerLabel,
  providerChatUrlPrefix,
} from '../src/providers.ts'

// The provider registry is the SINGLE source of truth for the chat backends.
// Adding a new one (ChatGPT, Gemini, …) must be a data change HERE plus the
// provider's own modules — these tests pin the contract the rest of the code
// relies on, so a new backend cannot silently break the config enum, /provider
// validation, the {provider} label or /chat.

test('registry has deepseek as the default and qwen registered', () => {
  assert.ok(isProviderId('deepseek'))
  assert.ok(isProviderId('qwen'))
  assert.equal(PROVIDERS.deepseek.isDefault, true)
  assert.equal(PROVIDERS.qwen.isDefault, false)
  assert.equal(PROVIDER_IDS[0], 'deepseek', 'the default must sort first')
})

test('isProviderId rejects unknown ids', () => {
  assert.equal(isProviderId('chatgpt'), false)
  assert.equal(isProviderId(''), false)
  assert.equal(isProviderId(null), false)
  assert.equal(isProviderId(42), false)
})

test('asProviderId falls back to the default', () => {
  assert.equal(asProviderId('qwen'), 'qwen')
  assert.equal(asProviderId('nope'), 'deepseek')
  assert.equal(asProviderId(undefined), 'deepseek')
})

test('providerLabel gives a human label for known ids', () => {
  assert.equal(providerLabel('qwen'), 'Qwen')
  assert.equal(providerLabel('deepseek'), 'DeepSeek')
  // Unknown falls back to the raw string (never throws).
  assert.equal(providerLabel('gemini'), 'gemini')
})

test('providerChatUrlPrefix is defined for every registered provider', () => {
  for (const id of PROVIDER_IDS) {
    assert.ok(
      providerChatUrlPrefix(id).startsWith('https://'),
      `missing/relative chat URL for ${id}`,
    )
  }
  assert.equal(providerChatUrlPrefix('qwen'), 'https://chat.qwen.ai/c')
})
