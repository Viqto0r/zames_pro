import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseModelIntent,
  emptyModelListMessage,
} from '../src/model-command.js'
import { translate } from '../src/i18n.js'

const t = translate('en')
const ru = translate('ru')

test('parseModelIntent: a provider without a picker is unsupported (deepseek)', () => {
  const r = parseModelIntent('deepseek', '', t)
  assert.equal(r.kind, 'unsupported')
  assert.match((r as { message: string }).message, /not available/i)
  // The provider LABEL is interpolated, not the id.
  assert.match((r as { message: string }).message, /deepseek/)
})

test('parseModelIntent: an ARG does not bypass the unsupported check', () => {
  const r = parseModelIntent('deepseek', 'some-model', t)
  assert.equal(r.kind, 'unsupported')
})

test('parseModelIntent: a picker provider with no arg lists', () => {
  assert.deepEqual(parseModelIntent('qwen', '', t), { kind: 'list' })
  assert.deepEqual(parseModelIntent('glm', '   ', t), { kind: 'list' })
})

test('parseModelIntent: a picker provider with an arg sets that exact id', () => {
  assert.deepEqual(parseModelIntent('qwen', 'qwen3-coder-plus', t), {
    kind: 'set',
    model: 'qwen3-coder-plus',
  })
  // Trimming matters: a stray space must not become part of the model id.
  assert.deepEqual(parseModelIntent('glm', '  glm-4.6  ', t), {
    kind: 'set',
    model: 'glm-4.6',
  })
})

test('parseModelIntent: an unknown provider has no picker either', () => {
  const r = parseModelIntent('nope' as string, '', t)
  assert.equal(r.kind, 'unsupported')
})

test('parseModelIntent: localization of the unsupported message', () => {
  const r = parseModelIntent('deepseek', '', ru)
  assert.equal(r.kind, 'unsupported')
  assert.match((r as { message: string }).message, /недоступен/)
})

test('emptyModelListMessage: says (none) in both locales', () => {
  assert.match(emptyModelListMessage(t), /\(none\)/)
  assert.match(emptyModelListMessage(ru), /\(none\)/)
})
