// GLM's chat id is read from the API body so `onChatReady` can save the
// session of a FRESH chat before the URL catches up. `extractChatId` looks for
// `chat_id` and for a bare `id`, but a wrapper object can carry its OWN `id`
// BEFORE the chat's: a message/request envelope (`{"id":"<msg-uuid>",
// "chat_id":"<chat-uuid>"}`) is fine, but an object that lists the chat
// UNDER another key with a DIFFERENT id first (`{"request_id":"…","id":
// "…"}`) is not — the wrong UUID becomes the session id and the saved session
// can never be opened again (`/resume` reports a chat that does not exist).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractChatId } from '../src/glm-net-capture.ts'

const UUID = '6f1c2a3e-1b2c-4d5e-8f90-123456789abc'
const OTHER = '11111111-2222-4333-8444-555555555555'

test('chat_id wins over a bare id in the same body', () => {
  const body = JSON.stringify({ id: OTHER, chat_id: UUID })
  assert.equal(extractChatId(body), UUID)
})

test('a bare id is still accepted when no chat_id is present', () => {
  assert.equal(extractChatId(JSON.stringify({ id: UUID })), UUID)
})

test('an id nested under a key that is not the chat is not used', () => {
  // A completion envelope: the assistant MESSAGE id sits next to the chat id.
  const body = JSON.stringify({
    message: { id: OTHER },
    chat: { id: UUID },
  })
  assert.notEqual(extractChatId(body), OTHER)
})

test('a non-uuid string never becomes a chat id', () => {
  assert.equal(extractChatId(JSON.stringify({ id: 'not-a-uuid' })), null)
})
