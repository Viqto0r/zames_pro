import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_ID_RE,
  STOP_NAME_RE,
  SERVER_BUSY_RE,
  ANSWER_URL_RE,
  UPLOAD_BUTTON_SELECTOR,
  chatUrl,
  chatHistoryUrl,
  modelIdFromTriggerId,
  normalizeGlmModelId,
  glmContextWindow,
} from '../src/glm-ui.ts'

// test/glm-ui.test.ts pins the URL builders, the model table order and the two
// status matchers. The edges of the SAME data were open: the trigger-id
// extraction on malformed ids, the id regex on a NON-uuid path and the case of
// the hex, the stop-label matcher (a long phrase must NOT look like Stop),
// the busy matcher on a CLAUSE (not a notice), and the answer/upload
// constants the browser relies on.

test('chatUrl appends the id, chatHistoryUrl ENCODES it', () => {
  assert.equal(chatUrl('abc'), 'https://chat.z.ai/c/abc')
  // The id is a path SEGMENT: a slash or a query in it must not break the URL.
  assert.equal(
    chatHistoryUrl('a/b?c'),
    'https://chat.z.ai/api/v1/chats/a%2Fb%3Fc',
  )
})

test('modelIdFromTriggerId needs the full `model-selector-<id>-button` shape', () => {
  assert.equal(
    modelIdFromTriggerId('model-selector-x-preview-l-button'),
    'x-preview-l',
  )
  // A hyphen INSIDE the id is kept (the greedy middle group).
  assert.equal(modelIdFromTriggerId('model-selector-a-b-button'), 'a-b')
  // An EMPTY id, a wrong shape and a non-string yield ''.
  assert.equal(modelIdFromTriggerId('model-selector--button'), '')
  assert.equal(modelIdFromTriggerId('nope'), '')
  assert.equal(modelIdFromTriggerId(null), '')
  assert.equal(modelIdFromTriggerId(undefined), '')
})

test('the context-window table matches the NORMALIZED id', () => {
  // Normalization drops every non-alphanumeric, so the label and the id meet.
  assert.equal(normalizeGlmModelId('GLM-5.3-Flash'), 'glm53flash')
  assert.equal(glmContextWindow('GLM-5.3-Flash'), 128_000)
  // The default chat model's INTERNAL id (no dots) hits its own entry FIRST.
  assert.equal(glmContextWindow('x-preview-l'), 128_000)
  // Most-specific-first: `glm45air` must not fall into `glm45`.
  assert.equal(glmContextWindow('glm-4.5-air'), 80_000)
  assert.equal(glmContextWindow('glm-4.5'), 80_000)
  assert.equal(glmContextWindow('glm-5-turbo'), 32_000)
  assert.equal(glmContextWindow('glm-5v-turbo'), 128_000)
  // Unknown / empty -> null.
  assert.equal(glmContextWindow('unknown'), null)
  assert.equal(glmContextWindow(''), null)
})

test('CHAT_ID_RE extracts a uuid case-insensitively and needs /c/', () => {
  const id = '0e651f21-d9a3-4120-b700-98f423da8af7'
  assert.equal(CHAT_ID_RE.exec('https://chat.z.ai/c/' + id)?.[1], id)
  const upper = 'ABCDEF01-2345-6789-ABCD-EF0123456789'
  assert.equal(CHAT_ID_RE.exec('https://chat.z.ai/c/' + upper)?.[1], upper)
  // The home page has no id; a NON-uuid segment is not a chat id.
  assert.equal(CHAT_ID_RE.test('https://chat.z.ai/'), false)
  assert.equal(CHAT_ID_RE.test('https://chat.z.ai/c/not-a-uuid'), false)
})

test('a Stop LABEL is a short word, not a sentence that starts with Stop', () => {
  for (const s of ['Stop', 'остановить', 'Stop generating', 'stop.']) {
    assert.equal(STOP_NAME_RE.test(s), true, s)
  }
  // A long phrase must not be mistaken for the Stop control.
  assert.equal(STOP_NAME_RE.test('Stop something long enough here'), false)
  assert.equal(STOP_NAME_RE.test('Stopping the server'), false)
})

test('the busy notice must be STANDALONE, not a clause in an answer', () => {
  for (const s of [
    'Server is busy',
    'Error: service unavailable.',
    'Server is busy!',
  ]) {
    assert.equal(SERVER_BUSY_RE.test(s), true, s)
  }
  assert.equal(
    SERVER_BUSY_RE.test('You can try again later in the docs.'),
    false,
  )
  assert.equal(SERVER_BUSY_RE.test('The server is busy with other work'), false)
})

test('the answer/upload constants are the ones the browser drives', () => {
  assert.equal(
    ANSWER_URL_RE.test('https://chat.z.ai/api/v2/chat/completions'),
    true,
  )
  assert.equal(ANSWER_URL_RE.test('https://chat.z.ai/api/v1/chats/'), false)
  assert.match(UPLOAD_BUTTON_SELECTOR, /upload-file-button/)
})
