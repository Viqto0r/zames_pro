// DeepSeek UI constants — the SINGLE place where chat.deepseek.com specifics live.
//
// WHY this module exists: the agent drives the DeepSeek web UI through
// Playwright, so every selector, button label and protocol marker is a
// hardcoded assumption about a page we do not control. Keeping them scattered
// across browser.ts made a DeepSeek redesign a diffuse, easy-to-miss breakage
// (a renamed class here, a relabeled button there). Concentrating them here
// turns "DeepSeek changed the UI" into ONE file to audit, and lets the health
// check (probeUiHealth) report the exact broken capability to the operator
// BEFORE a task hangs on it.
//
// Priority order everywhere: prefer SEMANTIC anchors (role / aria-label /
// accessible name / input type) over DeepSeek's `ds-*` class names, which
// drift between builds. The `ds-*` selectors stay in the chains as a
// high-precision FIRST hit, with semantic fallbacks after them.

// ---------- endpoints ----------

export const CHAT_URL = 'https://chat.deepseek.com/'
export const CHAT_ID_RE = /\/chat\/s\/([a-zA-Z0-9_-]+)/

// DeepSeek's chat URL shape. A direct navigation always yields the requested
// chat (the sidebar link click is tried first, this is the fallback).
export const CHAT_PATH_PREFIX = 'a/chat/s/'
export function chatUrl(id: string): string {
  return CHAT_URL + CHAT_PATH_PREFIX + id
}

// The history endpoint returns EVERY message of a chat as JSON (the rendered
// page virtualizes long chats). Requested from INSIDE the page so the auth
// cookie and PoW handling are the browser's; see browser.fetchChatMessages.
export const HISTORY_MESSAGES_URL =
  'https://chat.deepseek.com/api/v0/chat/history_messages'

// ---------- input ----------

export const INPUT_SELECTORS = [
  'textarea',
  'div[contenteditable="true"]',
  '[role="textbox"]',
]

// ---------- send ----------

// IMPORTANT: you MUST NOT add the generic
// 'div[role="button"][class*="ds-button--primary"]' here — it matches the
// STOP button too, and then _isGenerating() always returns true, so an answer
// is never considered ready.
export const SEND_SELECTORS = [
  'div[role="button"].ds-button--primary.ds-button--circle',
  'div[role="button"].ds-button--primary.ds-button--filled',
  'button[type="submit"]',
  'button[aria-label*="send" i]',
  'button[aria-label*="отправ" i]',
]

// DeepSeek's own button classes. Used as a coarse "is this a DeepSeek button?"
// filter in the raw-DOM fallbacks for Stop and for the send/stop icon
// detection. Kept as a source string because the fallback runs INSIDE
// page.evaluate, which cannot receive a RegExp object.
export const BUTTON_CLASS_RE = /ds-button--(circle|primary|filled)/i

// ---------- stop ----------

export const STOP_SELECTORS = [
  'div[role="button"][aria-label*="stop" i]',
  'div[role="button"][aria-label*="останов" i]',
  'button:has-text("Stop")',
  'button:has-text("Остановить")',
  'button[aria-label*="Stop" i]',
]

// Accessible name of the Stop button, for a TRUSTED Playwright click. A bare
// stop word (optionally with a short suffix), anchored and length-limited so a
// "Stop" inside rendered prose is never clicked.
export const STOP_NAME_RE = /^(?:stop|остановить)(?:\s+\S{0,20})?\s*[.!…]?$/i

// ---------- continue ----------

// DeepSeek's "Continue" button. With the reasoning ("Deep thinking") toggle on
// the server caps the THINK phase: the reasoning stops mid-way and the UI
// offers a Continue button (NOT the same as a truncated turn with
// generation_err — there the answer FAILED; here the model paused). The agent
// must click it so the reasoning/answer keeps flowing.
//
// Reasoning mode uses a LONGER label («Продолжить размышление» / «Continue
// thinking»), not a bare «Continue», so the match is a regex: a bare continue
// word OR the word plus a short reasoning/answer suffix. It is anchored and
// length-limited, so a "Continue" inside rendered prose is never clicked.
export const CONTINUE_NAME_RE =
  /^(?:continue|продолжить|продолжение)(?:\s+(?:think(?:ing)?|reason(?:ing)?|размышлени[ея]|генераци[юя]|ответ))?\s*[.!…]?$/i

// ---------- messages / answers ----------

// The rendered assistant answer. The FIRST hit is preferred (most specific),
// so `ds-markdown` stays ahead of the generic `markdown` catch-all.
export const ANSWER_SELECTORS = [
  'div.ds-assistant-message-main-content',
  'div[class*="ds-assistant-message-main-content"]',
  'div[class*="ds-markdown"]',
  'div[class*="markdown"]',
]

// Reasoning blocks. They are NOT the answer and must never be picked up as
// one, otherwise the terminal would show the model's long reasoning.
export const THINK_CLASS_RE = /ds-think-content|thinking-content/i

// Last-resort answer-only selectors for the restored-dialogue scraper. The
// generic `markdown` catch-all is deliberately absent here: without a message
// container it would also match a user bubble that happens to render markdown.
export const RESTORE_ANSWER_SELECTORS = [
  'div.ds-assistant-message-main-content',
  'div[class*="ds-assistant-message-main-content"]',
  'div[class*="ds-markdown"]',
]

// Message-level containers for the restored dialogue (broad first).
export const MESSAGE_CONTAINER_SELECTORS = [
  '[data-message-id]',
  '[class*="ds-message"]',
  '[class*="chat-message"]',
  '[class*="message-item"]',
  '[class*="_message"]',
]

// A message block is "assistant" when it carries the assistant class OR a
// rendered markdown wrapper (a user bubble has no rendered markdown). Used by
// the restored-dialogue scraper; the class names drift between builds, so the
// detection is content-based rather than class-prefix-only.
export const ASSISTANT_CLASS_RE = /ds-assistant-message|assistant-message/i
export const ASSISTANT_SELECTOR = '[class*="ds-assistant-message"]'
export const ANSWER_MARKDOWN_SELECTOR = '[class*="ds-markdown"]'

// A cheap "did the page grow?" signal (_chatSignal): count message nodes and
// measure the LAST answer node's text length. The old code read
// document.body.innerText.length every tick, which serializes the WHOLE page
// (sidebar, history, menus) and forces a layout — expensive on a long chat.
export const CHAT_SIGNAL_NODES_SELECTOR =
  '[class*="ds-message"], [class*="chat-message"], .ds-markdown'
export const MARKDOWN_SELECTOR = '.ds-markdown'

// ---------- new chat ----------

// The "New chat" control is NOT a <button>/<a> on the current DeepSeek build
// (it is a <div>), so matching only button/a missed it. Match any
// clickable-ish element whose text is EXACTLY the new-chat label (an anchored
// regex keeps a big outer container from matching its long descendant text).
export const NEW_CHAT_SELECTOR = 'button, a, [role="button"], div, span'
export const NEW_CHAT_TEXT_RE = /^\s*(new chat|новый чат|новый диалог)\s*$/i

// ---------- login ----------

// The login page is served on the same origin and swaps in a password field;
// the exact classes change, so we match loosely on input types and the known
// placeholder/autocomplete attributes.
export const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
]

export const LOGIN_SELECTORS = [
  'input[type="email"]',
  'input[type="tel"]',
  'input[name="email"]',
  'input[name="phone"]',
  'input[name="username"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="phone" i]',
  'input[placeholder*="телефон" i]',
  'input[placeholder*="почт" i]',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
]

// Any login-ish button: a primary DeepSeek button or a plain <button>. The
// visible label is filtered by LOGIN_NAME_RE so "Log in with Google" is not
// hit by mistake.
export const LOGIN_BUTTON_SELECTOR =
  'div[role="button"].ds-button--primary, button'
export const LOGIN_NAME_RE = /^\s*(log ?in|sign ?in|войти)\s*$/i
// A looser label test used inside the form fallback: a Continue button can also
// submit the login step on some builds.
export const LOGIN_FORM_SUBMIT_RE = /log ?in|sign ?in|войти|continue|продолж/i

export const LOGIN_SUBMIT_SELECTORS = [
  // DeepSeek's real button: a div[role=button] with these classes and a
  // <span class="ds-button__content">Log in</span> inside.
  'div[role="button"].ds-button--primary.ds-button--filled',
  'div[role="button"].ds-button--primary',
  'button[type="submit"]',
  'button:has-text("Log in")',
  'button:has-text("Sign in")',
  'button:has-text("Войти")',
  'div[role="button"]:has-text("Log in")',
  'div[role="button"]:has-text("Sign in")',
  'div[role="button"]:has-text("Войти")',
]

// ---------- MFA / email verification ----------
//
// After a correct password DeepSeek may demand a one-time code sent to the
// account email (the `.ds-mfa-verification-modal` dialog). The code input is
// the reliable anchor: `autocomplete=one-time-code` is a semantic attribute
// that survives class renames, so detection does not depend on DeepSeek's CSS.
// The submit button is matched both by its own class and by its label, since
// the modal is a newer component whose classes we cannot pin down.
export const MFA_CODE_SELECTORS = [
  'input[autocomplete="one-time-code"]',
  '.ds-mfa-verification-modal input[type="tel"]',
  'input[inputmode="numeric"][maxlength="6"]',
]

export const MFA_MODAL_SELECTOR = '.ds-mfa-verification-modal, [role="dialog"]'

export const MFA_SUBMIT_SELECTORS = [
  'div[role="button"].ds-mfa-verification-submit',
  '.ds-mfa-verification-modal div[role="button"].ds-button--primary',
  'div[role="button"]:has-text("Verify and log in")',
  'div[role="button"]:has-text("Verify")',
  'div[role="button"]:has-text("Подтвердить")',
  'div[role="button"]:has-text("Войти")',
]

// The email is NOT sent until the operator clicks "Send code" — the dialog only
// shows an empty field and a request button. The button lives inside the code
// field suffix and turns into a countdown ("Resend in 60s") once clicked, so we
// match it by its TEXT and skip it when it is already counting down.
export const MFA_SEND_CODE_RE =
  /^(send code|resend|отправить\s*код|отправить\s*повторно|выслать\s*код)\s*$/i

export const MFA_SEND_CODE_SELECTORS = [
  '.ds-verify-code-input-countdown',
  '.ds-mfa-verification-modal div[role="button"]',
  'div[role="button"]:has-text("Send code")',
  'div[role="button"]:has-text("Отправить код")',
]

// ---------- sidebar / chats ----------

export const SIDEBAR_TOGGLE_SELECTORS = [
  'button[aria-label*="sidebar" i]',
  'button[aria-label*="история" i]',
  'button[aria-label*="history" i]',
  'button[class*="sidebar-toggle"]',
  'button[class*="sidebarToggle"]',
]

// ---------- toggles (deep thinking / web search) ----------

// DeepSeek exposes two toggle buttons above the input. Their labels are
// localized, so we match by a loose regex on the visible text and read the
// state from aria-pressed. `.ds-toggle-button` is the class anchor; the
// semantic fallback ([aria-pressed] or [role=switch]) is tried when the class
// is renamed, so a redesign does not silently disable the toggles.
export const TOGGLE_SELECTORS = [
  '.ds-toggle-button',
  '[role="switch"]',
  'div[role="button"][aria-pressed]',
  'button[aria-pressed]',
]

export const DEEP_THINKING_RE = /глубок|deep\s*think/i
export const WEB_SEARCH_RE = /поиск|search/i

// ---------- attachments ----------

export const ATTACH_SELECTORS = [
  'div[role="button"][aria-label*="attach" i]',
  'div[role="button"][aria-label*="влож" i]',
  'button[aria-label*="attach" i]',
  'button[aria-label*="влож" i]',
  '[class*="upload"]',
  '[class*="attach"]',
]

// ---------- service statuses / errors ----------

// DeepSeek UI service statuses that are NOT the model's answer. Otherwise the
// agent takes a status (Reading...) for an answer and breaks parsing.
export const STATUS_RE =
  /^(reading|thinking|searching|analyzing|generating|stop|остановить|читаю|думаю|поиск|анализ)[\s.…]*$/i

// DeepSeek's answer when the rate limit is exceeded.
//
// IMPORTANT: the generic "try again later" / "повторите позже" tail is NOT
// part of this pattern. DeepSeek appends it to MANY toasts ("Server busy.
// Try again later.", "Service unavailable. Try again later."), so matching it
// here classified every server hiccup as a RATE LIMIT and sent the agent into
// a 5-minute wait. The rate limit is recognized by its specific wording only.
export const RATE_LIMIT_RE =
  /(messages? too frequent|too many requests|rate limit|слишком часто|сообщени[яе] слишком част)/i

// Transient server-side hiccups (DeepSeek overloaded / hiccup). Unlike the
// rate limit, these usually clear in seconds, so we retry quickly instead of
// waiting minutes.
export const SERVER_BUSY_RE =
  /(server (is )?busy|server error|service (is )?unavailable|temporarily unavailable|internal server error|502|503|504|server overloaded|сервер занят|сервер перегружен|сервис недоступен|внутренняя ошибка|попробуйте позже)/i

// ---------- network protocol (SSE) ----------

export const GENERATION_ERR_RE = /"finish_reason":\s*"generation_err"/i
// The server gave up on the turn ("Server busy, please try again later."):
// finish_reason is `generation_timeout` and there is NO RESPONSE fragment, so
// extractAnswer() returns '' and the finish loop would wait out the whole
// timeout. Same failure family as generation_err — the turn did not complete,
// so ask() must resend instead of hanging.
export const GENERATION_TIMEOUT_RE = /"finish_reason":\s*"generation_timeout"/i
// DeepSeek emits the generation status in TWO shapes: the initial message as a
// JSON property (`"quasi_status":"FINISHED"` inside v.response) and later
// BATCH updates (`{"p":"quasi_status","v":"FINISHED"}`). The old regex only
// matched the BATCH form, so a FINISHED-without-answer turn that came in the
// PROPERTY form (the real "Server is temporarily unavailable" case) was NOT
// detected — the agent hung on "Stopped" until the timeout. Match both.
export const INCOMPLETE_STATUS_RE = /"quasi_status"(?::|,"v":)"INCOMPLETE"/i

// A turn that ENDED (`quasi_status: FINISHED`) but produced NO answer text —
// the reasoning was generated and the model stopped WITHOUT a RESPONSE
// fragment. The UI shows Stopped + Continue. Matches both the JSON-property
// and the BATCH shape (see INCOMPLETE_STATUS_RE).
export const FINISHED_STATUS_RE = /"quasi_status"(?::|,"v":)"FINISHED"/i
export const RESPONSE_CONTENT_RE = /"type":"RESPONSE","content":"[^"]/

// Only a completion/continue turn carries a real answer. Gating the capture
// assignment to these URLs keeps a future endpoint (which happens to return a
// `content`/`text` field) from clobbering the answer and looking fresh.
export const ANSWER_URL_RE = /chat\/(completion|continue)/i
