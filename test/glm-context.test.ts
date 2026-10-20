import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  glmContextWindow,
  normalizeGlmModelId,
  modelIdFromTriggerId,
  chatUrl,
  CHAT_ID_RE,
} from '../src/glm-ui.ts'

test('glmContextWindow knows the live catalogue windows', () => {
  assert.equal(glmContextWindow('x-preview-l'), 128_000)
  assert.equal(glmContextWindow('GLM-5.3-Flash'), 128_000)
  assert.equal(glmContextWindow('glm-5.3'), 128_000)
  assert.equal(glmContextWindow('glm-5.2'), 64_064)
  assert.equal(glmContextWindow('glm-4.6v'), 16_000)
})

test('glmContextWindow is null for an unknown model (never guesses)', () => {
  assert.equal(glmContextWindow('some-future-model'), null)
  assert.equal(glmContextWindow(''), null)
  assert.equal(glmContextWindow(undefined), null)
})

test('normalizeGlmModelId drops punctuation and case', () => {
  assert.equal(normalizeGlmModelId('GLM-5.3-Flash'), 'glm53flash')
  assert.equal(normalizeGlmModelId('glm_4.6V'), 'glm46v')
})

test('modelIdFromTriggerId reads the id from the button id', () => {
  assert.equal(
    modelIdFromTriggerId('model-selector-x-preview-l-button'),
    'x-preview-l',
  )
  assert.equal(modelIdFromTriggerId('other'), '')
})

test('chatUrl and CHAT_ID_RE agree on the live chat URL', () => {
  const id = '0e651f21-d9a3-4120-b700-98f423da8af7'
  const url = chatUrl(id)
  assert.equal(url, 'https://chat.z.ai/c/' + id)
  const m = url.match(CHAT_ID_RE)
  assert.ok(m)
  assert.equal(m![1], id)
})
