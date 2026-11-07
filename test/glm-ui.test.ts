import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_ID_RE,
  chatUrl,
  chatHistoryUrl,
  modelIdFromTriggerId,
  normalizeGlmModelId,
  glmContextWindow,
  RATE_LIMIT_RE,
  SERVER_BUSY_RE,
  THINK_CLASS_RE,
  USER_CLASS_RE,
  ASSISTANT_CLASS_RE,
  STOP_NAME_RE,
} from '../src/glm-ui.ts'

// src/glm-ui.ts is the ONE place holding the z.ai selectors and protocol data.
// The PURE parts are pinned here: the URL builders, the model id parser and the
// per-model context window table (a wrong window makes auto-compact fire at
// the wrong point). The selectors themselves are DOM strings and are exercised
// by the browser smoke, not here.

test('a real chat url is /c/<uuid> and the id regex matches only a uuid', () => {
  const id = '11111111-2222-3333-4444-555555555555'
  assert.equal(chatUrl(id), 'https://chat.z.ai/c/' + id)
  const m = ('https://chat.z.ai/c/' + id).match(CHAT_ID_RE)
  assert.equal(m?.[1], id)
  assert.equal('https://chat.z.ai/'.match(CHAT_ID_RE), null)
  assert.equal('/c/not-a-uuid'.match(CHAT_ID_RE), null)
})

test('the chat id regex is case-insensitive on hex', () => {
  const id = 'ABCDEF01-2222-3333-4444-555555555555'
  assert.equal(('/c/' + id).match(CHAT_ID_RE)?.[1], id)
})

test('chatHistoryUrl encodes the id into one path segment', () => {
  assert.equal(
    chatHistoryUrl('a b/c'),
    'https://chat.z.ai/api/v1/chats/a%20b%2Fc',
  )
})

test('modelIdFromTriggerId pulls the id out of the button id', () => {
  assert.equal(modelIdFromTriggerId('model-selector-glm-5.3-button'), 'glm-5.3')
  assert.equal(
    modelIdFromTriggerId('model-selector-x-preview-l-button'),
    'x-preview-l',
  )
  assert.equal(modelIdFromTriggerId('other-id'), '')
  assert.equal(modelIdFromTriggerId(null), '')
  assert.equal(modelIdFromTriggerId(undefined), '')
})

test('normalizeGlmModelId lowercases and keeps only alphanumerics', () => {
  assert.equal(normalizeGlmModelId('GLM-5.3'), 'glm53')
  assert.equal(normalizeGlmModelId(' glm_4.7 '), 'glm47')
  assert.equal(normalizeGlmModelId(''), '')
  assert.equal(normalizeGlmModelId(undefined), '')
})

test('the context window table is matched most-specific first', () => {
  assert.equal(glmContextWindow('x-preview-l'), 128_000)
  assert.equal(glmContextWindow('GLM-5.3-Flash'), 128_000)
  assert.equal(glmContextWindow('glm-5.3'), 128_000)
  assert.equal(glmContextWindow('glm-5.2'), 64_064)
  assert.equal(glmContextWindow('glm-5-turbo'), 32_000)
  assert.equal(glmContextWindow('glm-4.7'), 40_000)
  assert.equal(glmContextWindow('glm-4.6v'), 16_000)
  assert.equal(glmContextWindow('glm-4.5-air'), 80_000)
  assert.equal(glmContextWindow('glm-4.5'), 80_000)
})

test('an unknown or empty model has no context window', () => {
  assert.equal(glmContextWindow('some-new-model'), null)
  assert.equal(glmContextWindow(''), null)
  assert.equal(glmContextWindow(undefined), null)
})

test('the rate-limit regex matches the server phrases, not an answer', () => {
  assert.equal(RATE_LIMIT_RE.test('Too many requests'), true)
  assert.equal(RATE_LIMIT_RE.test('rate limit exceeded'), true)
  assert.equal(RATE_LIMIT_RE.test('слишком часто'), true)
  assert.equal(RATE_LIMIT_RE.test('the code sends many requests'), false)
})

test('the busy regex needs a STANDALONE notice, not a clause', () => {
  assert.equal(SERVER_BUSY_RE.test('Server is busy'), true)
  assert.equal(SERVER_BUSY_RE.test('Error: service unavailable.'), true)
  assert.equal(
    SERVER_BUSY_RE.test('You can try again later in the docs.'),
    false,
  )
})

test('the class matchers pick the right role and skip reasoning blocks', () => {
  assert.equal(THINK_CLASS_RE.test('thinking-chain'), true)
  assert.equal(THINK_CLASS_RE.test('markdown-prose'), false)
  assert.equal(USER_CLASS_RE.test('chat-user'), true)
  assert.equal(USER_CLASS_RE.test('chat-assistant'), false)
  assert.equal(ASSISTANT_CLASS_RE.test('markdown-prose'), true)
  assert.equal(ASSISTANT_CLASS_RE.test('chat-user'), false)
})

test('the stop button label is a short Stop, not any sentence', () => {
  assert.equal(STOP_NAME_RE.test('Stop'), true)
  assert.equal(STOP_NAME_RE.test('остановить'), true)
  assert.equal(STOP_NAME_RE.test('Stop generating'), true)
  assert.equal(STOP_NAME_RE.test('Stop this long sentence here'), false)
})
