// The same padded-role bug exists in the Qwen and GLM history parsers: a role
// written `" USER "` failed the comparison and fell through to the ASSISTANT
// default, so the operator's own question was printed as the model's answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQwenHistory } from '../src/qwen-chats.ts'
import { parseGlmHistory } from '../src/glm-chats.ts'

test('Qwen: a padded USER role is not read as assistant', () => {
  const list = parseQwenHistory({
    data: { messages: [{ role: ' USER ', content: 'hi' }] },
  })
  assert.deepEqual(
    list.map((m) => m.role),
    ['user'],
  )
})

test('GLM: a padded USER role is not read as assistant', () => {
  const list = parseGlmHistory({
    messages: [{ role: ' USER ', content: 'hi' }],
  })
  assert.deepEqual(
    list.map((m) => m.role),
    ['user'],
  )
})

test('a clean role still parses (control)', () => {
  const list = parseQwenHistory({
    data: { messages: [{ role: 'user', content: 'hi' }] },
  })
  assert.deepEqual(
    list.map((m) => m.role),
    ['user'],
  )
})
