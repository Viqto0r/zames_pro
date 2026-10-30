import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_URL,
  CHAT_ID_RE,
  chatUrl,
  HISTORY_MESSAGES_URL,
  ANSWER_URL_RE,
  TOGGLE_SELECTORS,
  DEEP_THINKING_RE,
  WEB_SEARCH_RE,
  LOGIN_NAME_RE,
  LOGIN_BUTTON_SELECTOR,
  NEW_CHAT_TEXT_RE,
  SEND_SELECTORS,
  STOP_SELECTORS,
  BUTTON_CLASS_RE,
  GENERATION_ERR_RE,
  INCOMPLETE_STATUS_RE,
  FINISHED_STATUS_RE,
} from '../src/deepseek-ui.ts'
import {
  isGenerationIncompleteText,
  isRateLimitText,
  isServerBusyText,
} from '../src/browser.ts'

// The centralized DeepSeek UI constants (deepseek-ui.ts). These tests LOCK the
// semantics that browser.ts relies on, so moving a constant out cannot silently
// change behavior. Selector/regex values are the agent's contract with
// chat.deepseek.com — a redesign is expected to show up HERE first.

test('chat URL helpers build the DeepSeek chat URL', () => {
  assert.equal(CHAT_URL, 'https://chat.deepseek.com/')
  assert.equal(chatUrl('abc-123'), 'https://chat.deepseek.com/a/chat/s/abc-123')
  assert.equal(
    HISTORY_MESSAGES_URL,
    'https://chat.deepseek.com/api/v0/chat/history_messages',
  )
})

test('CHAT_ID_RE extracts the chat id from a URL', () => {
  const m = 'https://chat.deepseek.com/a/chat/s/abc-123_XY'.match(CHAT_ID_RE)
  assert.equal(m && m[1], 'abc-123_XY')
  assert.equal('https://chat.deepseek.com/'.match(CHAT_ID_RE), null)
})

test('ANSWER_URL_RE gates only completion/continue turns', () => {
  assert.equal(ANSWER_URL_RE.test('.../api/v0/chat/completion'), true)
  assert.equal(ANSWER_URL_RE.test('.../api/v0/chat/continue'), true)
  assert.equal(ANSWER_URL_RE.test('.../api/v0/chat/history_messages'), false)
})

test('toggle selectors include a semantic fallback beyond the ds- class', () => {
  assert.ok(TOGGLE_SELECTORS.includes('.ds-toggle-button'))
  // A renamed class must not silently disable the toggles.
  assert.ok(TOGGLE_SELECTORS.some((s) => s.includes('aria-pressed')))
  assert.ok(TOGGLE_SELECTORS.some((s) => s.includes('switch')))
})

test('toggle label regexes are language-agnostic', () => {
  assert.equal(DEEP_THINKING_RE.test('Deep thinking'), true)
  assert.equal(DEEP_THINKING_RE.test('Глубокое мышление'), true)
  // The LIVE label has no space: without it the reasoning toggle was never
  // found, so the agent silently ran WITHOUT reasoning.
  assert.equal(DEEP_THINKING_RE.test('DeepThink'), true)
  assert.equal(WEB_SEARCH_RE.test('Smart search'), true)
  assert.equal(WEB_SEARCH_RE.test('Поиск в сети'), true)
  assert.equal(WEB_SEARCH_RE.test('Search'), true)
  // The two toggles must never be confused with each other.
  assert.equal(DEEP_THINKING_RE.test('Search'), false)
  assert.equal(WEB_SEARCH_RE.test('DeepThink'), false)
})

test('login button + label do not match the Google button', () => {
  assert.ok(
    LOGIN_BUTTON_SELECTOR.includes('div[role="button"].ds-button--primary'),
  )
  assert.ok(LOGIN_BUTTON_SELECTOR.includes('button'))
  assert.equal(LOGIN_NAME_RE.test('Log in'), true)
  assert.equal(LOGIN_NAME_RE.test('Войти'), true)
  assert.equal(LOGIN_NAME_RE.test('Log in with Google'), false)
})

test('new chat regex matches only the exact label', () => {
  assert.equal(NEW_CHAT_TEXT_RE.test('New chat'), true)
  assert.equal(NEW_CHAT_TEXT_RE.test('Новый чат'), true)
  assert.equal(NEW_CHAT_TEXT_RE.test('New chat with the whole sidebar'), false)
})

test('send/stop selector chains keep the ds- anchor and a semantic fallback', () => {
  assert.ok(SEND_SELECTORS.some((s) => s.includes('ds-button--')))
  assert.ok(SEND_SELECTORS.some((s) => s.includes('aria-label')))
  assert.ok(STOP_SELECTORS.some((s) => s.includes('aria-label')))
  // The generic primary-button selector must NEVER be a send candidate: it
  // also matches the Stop button, which would make _isGenerating() always true.
  assert.ok(
    !SEND_SELECTORS.includes('div[role="button"][class*="ds-button--primary"]'),
  )
})

test('BUTTON_CLASS_RE matches the DeepSeek button classes used by the DOM fallbacks', () => {
  assert.equal(BUTTON_CLASS_RE.test('ds-button ds-button--primary'), true)
  assert.equal(BUTTON_CLASS_RE.test('ds-button--circle'), true)
  assert.equal(BUTTON_CLASS_RE.test('some-other-button'), false)
})

test('SSE markers detect truncation / finished-without-answer', () => {
  assert.equal(
    isGenerationIncompleteText('data: {"finish_reason":"generation_err"}'),
    true,
  )
  // The marker regexes are anchored to a line start on purpose (a mention of
  // the marker inside our own text must not match), so the fixture carries
  // the real BATCH line shape rather than a bare fragment.
  assert.equal(
    isGenerationIncompleteText(
      'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"INCOMPLETE"}]}',
    ),
    true,
  )
  // A server-side timeout ("Server busy, please try again later."): the turn
  // did not complete and has no RESPONSE, so it must be retried like
  // generation_err instead of hanging the finish loop.
  assert.equal(
    isGenerationIncompleteText('data: {"finish_reason":"generation_timeout"}'),
    true,
  )
  assert.equal(GENERATION_ERR_RE.test('data: {"finish_reason":"stop"}'), false)
  assert.equal(
    INCOMPLETE_STATUS_RE.test(
      'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
    ),
    false,
  )
  // isFinishedWithoutAnswer() lives in net-capture.ts and uses this.
  assert.equal(
    FINISHED_STATUS_RE.test(
      'data: {"p":"response","o":"BATCH","v":[{"p":"quasi_status","v":"FINISHED"}]}',
    ),
    true,
  )
  // A mention inside our OWN text (escaped quotes in a JSON string value)
  // must never be read as a protocol marker.
  assert.equal(
    isGenerationIncompleteText(
      'data: {"text":"a tool result that says \\"quasi_status\\",\\"v\\":\\"INCOMPLETE\\""}',
    ),
    false,
  )
})

test('rate-limit vs server-busy stay distinct (the shared toast tail is not a rate limit)', () => {
  assert.equal(isRateLimitText('Messages too frequent. Try again later.'), true)
  assert.equal(
    isRateLimitText('Server is busy. Try again later.'),
    false,
    'the generic "try again later" tail must NOT be classified as a rate limit',
  )
  assert.equal(isServerBusyText('Server is busy. Try again later.'), true)
  assert.equal(isServerBusyText('Messages too frequent.'), false)
})

test('a normal answer discussing a busy server is not a server-busy notice', () => {
  // A toast container can include the surrounding conversation text; the old
  // pattern matched "server is busy" anywhere, so a healthy answer threw
  // ServerBusyError and the loop resent the turn (live: 6 Continue clicks).
  const answer =
    'If the server is busy, retry later. The answer: the server error text must be parsed.'
  assert.equal(isServerBusyText(answer), false)
  // The real notice still matches, alone or after a separator.
  assert.equal(isServerBusyText('Server busy, please try again later.'), true)
  assert.equal(isServerBusyText('Ошибка: Сервер занят, попробуйте позже'), true)
  assert.equal(isServerBusyText('Сервер занят, попробуйте позже'), true)
})
