import { test } from 'node:test'
import assert from 'node:assert/strict'
import { providerWithoutPickerMessage } from '../src/provider-command.ts'
import type { TranslateParams } from '../src/i18n.ts'

// `providerWithoutPickerMessage` names the provider in the `/model` refusal.
// An UNKNOWN id is echoed back verbatim (`providerLabel` → `String(id)`), so a
// newline in a hand-edited config value started a row of its own in the
// terminal — the label must be flattened like every other report value.

const NL = String.fromCharCode(10)
const t = (k: string, p?: TranslateParams): string =>
  k + (p ? JSON.stringify(p) : '')

test('a newline in an unknown provider label stays on one line', () => {
  const msg = providerWithoutPickerMessage('deep' + NL + 'seek', t)
  assert.ok(msg)
  assert.equal((msg as string).includes(NL), false, JSON.stringify(msg))
})

test('a known provider without a picker is still refused', () => {
  assert.ok(providerWithoutPickerMessage('deepseek', t))
})

test('a provider WITH a picker is not refused', () => {
  assert.equal(providerWithoutPickerMessage('qwen', t), null)
})
