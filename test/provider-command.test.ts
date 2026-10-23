import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseProviderIntent,
  providerUsageMessage,
  providerWithoutPickerMessage,
} from '../src/provider-command.js'
import { translate } from '../src/i18n.js'

const t = translate('en')

test('parseProviderIntent: no arg and "status" print the state', () => {
  assert.deepEqual(parseProviderIntent('', 'qwen'), { kind: 'status' })
  assert.deepEqual(parseProviderIntent('   ', 'qwen'), { kind: 'status' })
  assert.deepEqual(parseProviderIntent('status', 'glm'), { kind: 'status' })
  assert.deepEqual(parseProviderIntent('STATUS', 'glm'), { kind: 'status' })
})

test('parseProviderIntent: "login" is case-insensitive', () => {
  assert.deepEqual(parseProviderIntent('login', 'qwen'), { kind: 'login' })
  assert.deepEqual(parseProviderIntent(' Login ', 'qwen'), { kind: 'login' })
})

test('parseProviderIntent: a known id is a switch, and "same" flags a no-op', () => {
  assert.deepEqual(parseProviderIntent('qwen', 'deepseek'), {
    kind: 'switch',
    provider: 'qwen',
    same: false,
  })
  assert.deepEqual(parseProviderIntent('Qwen', 'qwen'), {
    kind: 'switch',
    provider: 'qwen',
    same: true,
  })
})

test('parseProviderIntent: an unknown id is a usage error, not a switch', () => {
  assert.deepEqual(parseProviderIntent('gpt-5', 'qwen'), { kind: 'usage' })
  assert.deepEqual(parseProviderIntent('deepseek2', 'qwen'), { kind: 'usage' })
})

test('providerUsageMessage: lists every provider id', () => {
  const m = providerUsageMessage(t)
  assert.match(m, /deepseek/)
  assert.match(m, /qwen/)
  assert.match(m, /glm/)
})

test('providerWithoutPickerMessage: null for a picker provider, text otherwise', () => {
  assert.equal(providerWithoutPickerMessage('qwen', t), null)
  assert.equal(providerWithoutPickerMessage('glm', t), null)
  const m = providerWithoutPickerMessage('deepseek', t)
  assert.ok(m && /DeepSeek/.test(m))
})
