import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_ID_RE,
  chatUrl,
  chatHistoryUrl,
  normalizeModelId,
  qwenContextWindow,
  ANSWER_URL_RE,
  RATE_LIMIT_RE,
  SERVER_BUSY_RE,
  THINK_CLASS_RE,
  ASSISTANT_CLASS_RE,
  COOKIE_ACCEPT_RE,
  THINKING_MODE_RE,
  FAST_MODE_RE,
  WEB_SEARCH_MENU_RE,
  DEEP_THINKING_RE,
  WEB_SEARCH_RE,
} from '../src/qwen-ui.ts'

// src/qwen-ui.ts holds the chat.qwen.ai selectors and protocol data. The PURE
// parts are pinned here: the URL builders, the per-model context window table
// (it feeds the status-bar fill and the auto-compact threshold) and the narrow
// status/toggle regexes.

test('a chat id is /c/<id>, guest included', () => {
  assert.equal(chatUrl('abc'), 'https://chat.qwen.ai/c/abc')
  assert.equal('/c/abc_1-2'.match(CHAT_ID_RE)?.[1], 'abc_1-2')
  assert.equal('/c/guest'.match(CHAT_ID_RE)?.[1], 'guest')
  assert.equal('https://chat.qwen.ai/'.match(CHAT_ID_RE), null)
})

test('chatHistoryUrl encodes the id and carries the direction and limit', () => {
  assert.equal(
    chatHistoryUrl('a b', 10),
    'https://chat.qwen.ai/api/v2/chats/a%20b?direction=up&limit=10',
  )
  assert.equal(
    chatHistoryUrl('x'),
    'https://chat.qwen.ai/api/v2/chats/x?direction=up&limit=50',
  )
})

test('normalizeModelId lowercases and keeps only alphanumerics', () => {
  assert.equal(normalizeModelId('Qwen3.7-Max'), 'qwen37max')
  assert.equal(normalizeModelId(' qwen3_max '), 'qwen3max')
  assert.equal(normalizeModelId(undefined), '')
})

test('the 1M builds win over the 258K qwen3-max rule', () => {
  assert.equal(qwenContextWindow('qwen3.7-max'), 1_000_000)
  assert.equal(qwenContextWindow('Qwen3.8-Max'), 1_000_000)
  assert.equal(qwenContextWindow('qwen3-coder-plus'), 1_000_000)
  assert.equal(qwenContextWindow('qwenlong-l1'), 10_000_000)
  assert.equal(qwenContextWindow('qwen3-max'), 258_048)
})

test('an unknown qwen3 build falls back to 1M, other ids are unknown', () => {
  assert.equal(qwenContextWindow('qwen3-plus'), 1_000_000)
  assert.equal(qwenContextWindow('gpt-4o'), null)
  assert.equal(qwenContextWindow(''), null)
  assert.equal(qwenContextWindow(undefined), null)
})

test('the answer gate matches only the completions SSE endpoint', () => {
  assert.equal(
    ANSWER_URL_RE.test('https://chat.qwen.ai/api/v2/chat/completions'),
    true,
  )
  assert.equal(ANSWER_URL_RE.test('https://chat.qwen.ai/api/v2/chats/x'), false)
})

test('the rate-limit regex matches the server phrases, not an answer', () => {
  assert.equal(RATE_LIMIT_RE.test('Rate limit reached'), true)
  assert.equal(RATE_LIMIT_RE.test('Слишком часто'), true)
  assert.equal(RATE_LIMIT_RE.test('my code sends many requests'), false)
})

test('the busy regex needs a STANDALONE notice, not a clause', () => {
  assert.equal(SERVER_BUSY_RE.test('Server is busy'), true)
  assert.equal(SERVER_BUSY_RE.test('Service unavailable.'), true)
  assert.equal(
    SERVER_BUSY_RE.test('You can try again later in the docs.'),
    false,
  )
})

test('the role and reasoning matchers separate the blocks', () => {
  assert.equal(THINK_CLASS_RE.test('qwen-thinking-content'), true)
  assert.equal(THINK_CLASS_RE.test('markdown-body'), false)
  assert.equal(ASSISTANT_CLASS_RE.test('assistant-message'), true)
  assert.equal(ASSISTANT_CLASS_RE.test('user-message'), false)
})

test('the cookie button label is exactly Accept all cookies', () => {
  assert.equal(COOKIE_ACCEPT_RE.test('Accept all cookies'), true)
  assert.equal(COOKIE_ACCEPT_RE.test('Accept all cookies please'), false)
})

test('the toggle labels map to their modes', () => {
  assert.equal(THINKING_MODE_RE.test('Thinking'), true)
  assert.equal(THINKING_MODE_RE.test('размышление'), true)
  assert.equal(FAST_MODE_RE.test('Fast'), true)
  assert.equal(FAST_MODE_RE.test('быстрый'), true)
  assert.equal(WEB_SEARCH_MENU_RE.test('Web Search'), true)
  assert.equal(WEB_SEARCH_MENU_RE.test('веб-поиск'), true)
  assert.equal(DEEP_THINKING_RE.test('reason'), true)
  assert.equal(WEB_SEARCH_RE.test('search'), true)
})
