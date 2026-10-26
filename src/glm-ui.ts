// GLM (chat.z.ai) UI constants - the SINGLE place where the z.ai web app's
// specifics live (mirrors qwen-ui.ts / deepseek-ui.ts).
//
// WHY a data module: zames drives the site through Playwright, so every
// selector and protocol marker is a hardcoded assumption about a page we do
// not control. Concentrating them here turns "z.ai redesigned the UI" into ONE
// file to audit and lets probeUiHealth name the exact broken capability.
//
// EVERY value below was verified against a LIVE signed-in session (Chromium,
// October 2026); the raw fixtures live in test/fixtures/glm/. Values marked
// "not observed" are deliberately NOT implemented - the recon dump had no
// trace of them.
//
// What the recon showed:
//   home      -> https://chat.z.ai/
//   chat url  -> /c/<uuid>
//   input     -> textarea#chat-input (a plain <textarea>)
//   send      -> button#send-message-button (type=submit)
//   new chat  -> button#sidebar-new-chat-button, #new-chat-button (mobile)
//   model     -> button#model-selector-<id>-button (label = display name)
//   stop      -> no dedicated id was observed; Escape is the interrupt
//   answer    -> div.chat-assistant (markdown-prose); user: div.chat-user;
//                reasoning lives in .thinking-chain-container
//   send flow -> POST /api/v1/chats/new (creates the chat), then
//                POST /api/v2/chat/completions?... (SSE)
//   history   -> GET /api/v1/chats/?page=N and GET /api/v1/chats/<id>
//   models    -> GET /api/models (OpenAI-style {data:[{id,name,info}]})
//   user      -> GET /api/v1/auths/ ({email, role: 'guest' | 'user', token})
//
// IMPORTANT (captcha): the first message from a fresh profile is gated by an
// Aliyun slider captcha that a headless browser cannot pass. That is why login
// is browser-based (src/browser-login.ts) and why a long agent run needs a
// REAL session.

// ---------- endpoints ----------

export const CHAT_URL = 'https://chat.z.ai/'
export const LOGIN_URL = 'https://chat.z.ai/auth'

// A real chat lives at /c/<uuid>; the bare home page has no id yet.
export const CHAT_ID_RE =
  /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export function chatUrl(id: string): string {
  return CHAT_URL + 'c/' + id
}

/** GET - the OpenAI-style model catalogue. */
export const MODELS_URL = 'https://chat.z.ai/api/models'

/** GET - the sidebar chat list (newest first). */
export const CHAT_LIST_URL = 'https://chat.z.ai/api/v1/chats/?page=1'

/** GET - one chat with its full message tree. */
export function chatHistoryUrl(chatId: string): string {
  return 'https://chat.z.ai/api/v1/chats/' + encodeURIComponent(chatId)
}

/** GET - the current user (or guest) record. */
export const AUTH_URL = 'https://chat.z.ai/api/v1/auths/'

/** POST - the SSE completion endpoint (the answer stream). */
export const ANSWER_URL_RE = /\/api\/v2\/chat\/completions/i

// ---------- input ----------

export const INPUT_SELECTORS = [
  'textarea#chat-input',
  'textarea[placeholder]',
  'textarea',
  'div[contenteditable="true"]',
  '[role="textbox"]',
]

// ---------- send ----------

export const SEND_SELECTORS = [
  'button#send-message-button',
  'button.sendMessageButton',
  'button[type="submit"]',
]

// ---------- stop ----------

// No dedicated stop id was observed: z.ai swaps the send button's icon and
// disables the input while generating. A dedicated button is still probed (a
// future build may add one); Escape is the fallback that works today.
export const STOP_SELECTORS = [
  'button#stop-generating-button',
  'button[aria-label*="stop" i]',
  'button[aria-label*="останов" i]',
]
export const STOP_NAME_RE = /^(?:stop|остановить)(?:\s+\S{0,20})?\s*[.!…]?$/i

// ---------- new chat ----------

export const NEW_CHAT_SELECTOR =
  'button#sidebar-new-chat-button, button#new-chat-button'

// ---------- model selector ----------

// The header button carries the model id in its OWN id and the display name in
// its label: button#model-selector-<id>-button -> "GLM-5.3-Flash".
export const MODEL_TRIGGER_SELECTOR = 'button[id^="model-selector-"]'

/** The model id embedded in the trigger's id (`model-selector-<id>-button`). */
export function modelIdFromTriggerId(id: string | null | undefined): string {
  const m = String(id || '').match(/^model-selector-(.+)-button$/)
  return m ? m[1] : ''
}

// ---------- messages / answers ----------

// The assistant turn is div.chat-assistant (markdown-prose); a user turn is
// div.chat-user. A message WRAPPER carries id="message-<uuid>" on both.
export const ANSWER_SELECTORS = ['.chat-assistant', '.markdown-prose']

// Reasoning blocks (the "Thought Process" chain) must never be read as the
// answer.
export const THINK_CLASS_RE = /thinking-chain|thought|reason/i

export const MESSAGE_CONTAINER_SELECTORS = [
  '[id^="message-"]',
  '.chat-user',
  '.chat-assistant',
]
export const USER_CLASS_RE = /chat-user|user-message/i
export const ASSISTANT_CLASS_RE = /chat-assistant|markdown-prose/i

// A cheap "did the page grow?" signal.
export const CHAT_SIGNAL_NODES_SELECTOR =
  '[id^="message-"], .chat-user, .chat-assistant'
export const MARKDOWN_SELECTOR = '.chat-assistant, .markdown-prose'

// ---------- context windows ----------

// GLM windows are PER-MODEL and reported by GET /api/models
// (`info.params.max_tokens` when present). The table is the fallback for a
// model whose catalogue entry carries no explicit value, ordered MOST SPECIFIC
// first. Values come from the live catalogue snapshot (test/fixtures/glm/).
const CONTEXT_WINDOWS: Array<[RegExp, number]> = [
  // The DEFAULT chat model's internal id is `x-preview-l` (label
  // GLM-5.3-Flash), so the id and the label are matched separately.
  [/xpreviewl/, 128_000],
  [/glm5\.?3flash/, 128_000],
  [/glm5\.?3/, 128_000],
  [/glm5\.?2/, 64_064],
  [/glm5vturbo/, 128_000],
  [/glm5turbo/, 32_000],
  [/glm47/, 40_000],
  [/glm46v/, 16_000],
  [/glm45air/, 80_000],
  [/glm45/, 80_000],
]

/** Lowercase and drop every non-alphanumeric so `glm-5.3` -> `glm53`. */
export function normalizeGlmModelId(model: string | undefined): string {
  return String(model || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** The context window (tokens) for a GLM model id, or null when unknown. */
export function glmContextWindow(model: string | undefined): number | null {
  const id = normalizeGlmModelId(model)
  if (!id) return null
  for (const [re, window] of CONTEXT_WINDOWS) {
    if (re.test(id)) return window
  }
  return null
}

// ---------- service statuses / errors ----------

// Rate limit / busy notices. Kept NARROW: the classifier additionally requires
// an error payload or an answer-less body (same rule as qwen-net-capture.ts),
// so a normal answer that merely mentions "try again" is not mistaken for a
// limit.
export const RATE_LIMIT_RE =
  /too many requests|rate limit|too frequent|please try again later|слишком часто/i
export const SERVER_BUSY_RE =
  /server is busy|service unavailable|try again later|high demand/i

// ---------- attachments ----------

// The observed upload control (a real filechooser on click).
export const UPLOAD_BUTTON_SELECTOR =
  '#upload-file-button, button[class*="upload"]'
