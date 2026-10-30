// Qwen Chat (chat.qwen.ai) UI constants — the SINGLE place where the Qwen
// web app's specifics live.
//
// WHY this mirrors deepseek-ui.ts: zames drives the site through Playwright,
// so every selector and protocol marker is a hardcoded assumption about a
// page we do not control. Concentrating them here turns "Qwen redesigned the
// UI" into ONE file to audit and lets probeUiHealth report the exact broken
// capability BEFORE a task hangs on it.
//
// Values verified against a live guest session (headless Chromium):
//   input  -> textarea.message-input-textarea (placeholder "Ask Qwen")
//   send   -> button.send-button (aria-label "Send")
//   model  -> .wms-trigger (aria-label "Select Model")
//   new    -> .new-chat (aria-label "New Chat")
// The API is a two-step v2 flow: POST /api/v2/chats/new -> { id }, then
// POST /api/v2/chat/completions?chat_id=<id> (SSE, see qwen-net-capture.ts).

// ---------- endpoints ----------

export const CHAT_URL = 'https://chat.qwen.ai/'

// A logged-in chat lives at /c/<id>; a guest chat is /c/guest.
export const CHAT_ID_RE = /\/c\/([A-Za-z0-9_-]+)/

export function chatUrl(id: string): string {
  return CHAT_URL + 'c/' + id
}

export const MODELS_URL = 'https://chat.qwen.ai/api/v2/models/'

// The chat list, newest first, EXCLUDING project chats (verified live on a
// signed-in session). Used by listChats() instead of scraping the sidebar.
export const CHAT_LIST_URL =
  'https://chat.qwen.ai/api/v2/chats/?page=1&exclude_project=true'

// One chat's messages: GET /api/v2/chats/<id>?direction=up&limit=N. Verified
// live while switching chats. Used by fetchChatMessages().
export function chatHistoryUrl(chatId: string, limit = 50): string {
  return (
    'https://chat.qwen.ai/api/v2/chats/' +
    encodeURIComponent(chatId) +
    '?direction=up&limit=' +
    String(limit)
  )
}

// The completions SSE endpoint carries the real answer; used to gate the
// network capture so an unrelated JSON endpoint never clobbers it.
export const ANSWER_URL_RE = /\/api\/v2\/chat\/completions/i

// ---------- input ----------

export const INPUT_SELECTORS = [
  'textarea.message-input-textarea',
  'textarea[placeholder="Ask Qwen"]',
  'textarea',
  'div[contenteditable="true"]',
  '[role="textbox"]',
]

// ---------- send ----------

// The send control is a <button class="send-button"> with aria-label "Send".
// A generic primary button is deliberately NOT matched: it could be the Stop
// control, which would make _isGenerating() always true.
export const SEND_SELECTORS = [
  'button.send-button',
  'button[aria-label="Send" i]',
  '.message-input-right-button-send button',
  'button[type="submit"]',
]

// ---------- stop ----------

export const STOP_SELECTORS = [
  'button[aria-label*="stop" i]',
  'button[aria-label*="останов" i]',
  'button.stop-button',
  'button:has-text("Stop")',
]

export const STOP_NAME_RE = /^(?:stop|остановить)(?:\s+\S{0,20})?\s*[.!…]?$/i

// ---------- new chat ----------

export const NEW_CHAT_SELECTOR = '.new-chat, button[aria-label="New Chat" i]'

// ---------- model selector ----------

// The current model label sits in the header. It is read-only for the UI; the
// model itself is chosen via the config (sent with each completion request)
// unless a per-session override is set.
export const MODEL_TRIGGER_SELECTOR = '.wms-trigger'

// ---------- context windows ----------

// Qwen's per-model context window (tokens). The window is a property of the
// MODEL, not the site: Qwen3-Max is 258K while the 3.7/3.8-Max and Coder
// builds are 1M. zames uses the number ONLY as the denominator for the
// status-bar fill percentage and the auto-compact threshold, so a wrong value
// either fires compaction far too late (window overstated) or too early.
//
// Matching is done on a NORMALIZED id: lowercased, non-alphanumerics dropped,
// so `qwen3-max`, `Qwen3-Max` and `qwen3_max` all hit the same row. The list is
// ordered MOST SPECIFIC first: a `qwen3-coder-plus` id must not stop at a
// generic `qwen3` rule. Values verified against the public model cards
// (contextwindows.dev / haimaker.ai) in October 2026.
const CONTEXT_WINDOWS: Array<[RegExp, number]> = [
  // The 1M builds MUST be checked before the 258K `qwen3-max` family, or
  // `qwen3.7-max` would match the shorter `max` rule first.
  [/qwen3\.?7.?max/, 1_000_000],
  [/qwen3\.?8.?max/, 1_000_000],
  [/qwen3coder/, 1_000_000],
  [/qwenlong/, 10_000_000],
  [/qwen3max/, 258_048],
  // Generic fallback: the OTHER qwen3 builds (Plus/Turbo/Flash) advertised 1M
  // on their model cards, so an unknown qwen3 id gets 1M rather than the min.
  [/qwen3/, 1_000_000],
]

/** Lowercase and drop every non-alphanumeric so `qwen3.7-max` -> `qwen37max`. */
export function normalizeModelId(model: string | undefined): string {
  return String(model || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** The context window (tokens) for a Qwen model id, or null when unknown. */
export function qwenContextWindow(model: string | undefined): number | null {
  const id = normalizeModelId(model)
  if (!id) return null
  for (const [re, window] of CONTEXT_WINDOWS) {
    if (re.test(id)) return window
  }
  return null
}

// ---------- age gate / cookies ----------

// A first-time visitor must confirm their birth year before chatting. The
// dialog is an ant-modal; the Continue button is the black footer button.
export const AGE_GATE_MODAL = '.age-confirmation-modal'
// The Continue button inside the age gate (the black footer button).
export const AGE_GATE_CONTINUE =
  '.age-confirmation-modal .qwen-chat-v2-btn-black'
// The year dropdown TRIGGER inside the age gate. It must be clicked to open
// the year menu; clicking the label alone does not select a year.
export const AGE_GATE_YEAR_SELECT =
  '.age-confirmation-year .qwen-chat-v2-dropdown-menu-select'
// A year OPTION in the opened dropdown (the menu item text is the year).
export const AGE_GATE_YEAR_OPTION = '.qwen-chat-v2-dropdown-menu-item'

// The cookie banner's accept button (matched by its visible label).
export const COOKIE_ACCEPT_RE = /^accept all cookies$/i

// ---------- messages / answers ----------

// Assistant answers render as markdown blocks. The class names drift between
// builds, so a content wrapper is tried first, then the generic markdown.
export const ANSWER_SELECTORS = [
  '[class*="markdown-content"]',
  '[class*="markdown"]',
  '[class*="answer"]',
]

// Reasoning / thinking summaries are NOT the answer and must never be picked
// up as one (the terminal would show the model's long reasoning).
export const THINK_CLASS_RE = /thinking|think-content|think_summary/i

// Message-level containers for the restored dialogue (broad first).
export const MESSAGE_CONTAINER_SELECTORS = [
  '[class*="chat-message"]',
  '[class*="message-item"]',
  '[data-message-id]',
  '[class*="message"]',
]

export const ASSISTANT_CLASS_RE = /assistant|answer|markdown/i

// A cheap "did the page grow?" signal: count message nodes and measure the
// last answer node's text length (no full-body innerText walk).
export const CHAT_SIGNAL_NODES_SELECTOR =
  '[class*="markdown"], [class*="chat-message"], [class*="message-item"]'
export const MARKDOWN_SELECTOR = '[class*="markdown"]'

// ---------- attachments ----------

// The attach flow on Qwen: click the "+" (`.mode-select-open`) to open the
// mode menu, then the "Upload attachment" item — that click fires a real
// filechooser. The hidden <input id="filesUpload"> is the fallback (setting
// files on it directly).
export const ATTACH_MENU_TRIGGER = '.mode-select-open'
export const ATTACH_MENU_ITEM_RE = /upload attachment/i
export const ATTACH_SELECTORS = ['input#filesUpload', 'input[type="file"]']

// ---------- login ----------

// Qwen's sign-in is a SEPARATE origin (auth.qwen.ai) opened from the header
// "Log in" button. Email / Google / GitHub are accepted; no phone required.
export const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
]

export const LOGIN_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[placeholder*="email" i]',
  'input[autocomplete="email"]',
  'input[autocomplete="username"]',
]

// ---------- service statuses / errors ----------

// Qwen's rate-limit / busy notices (best-effort; the toast may be short-lived).
export const RATE_LIMIT_RE =
  /too many requests|rate limit|too frequent|please try again later|слишком часто/i
// A notice, not a phrase inside the answer (same lesson as the DeepSeek
// pattern): the classifier also requires an error payload or an answer-less
// body, and the phrase must stand alone.
// A NOTICE, not a phrase inside a reply: the phrase must start a clause
// (start of the text, after a newline/punctuation/colon, or right after a
// `"content":"` / `"error":"` JSON key) and end one. A normal answer that
// says "try again later" therefore does not look like a dead server.
export const SERVER_BUSY_RE =
  /(?:^|[\n!?:]\s*|\.\s+|"(?:content|error)"\s*:\s*")(?:server is busy|service unavailable|try again later)(?=[.!,]|"|$)/im

// ---------- toggles (thinking mode / web search) ----------

// Qwen exposes thinking as a MODE dropdown (`.qwen-thinking-selector`, label
// "Auto" by default) with options Auto / Thinking / Fast — NOT a boolean
// toggle like DeepSeek. Web search is an item in the "+" (mode) menu. Both
// are applied best-effort before a send.
export const THINKING_SELECTOR = '.qwen-thinking-selector'
// Menu options that select a thinking mode (matched by normalized label).
export const THINKING_MODE_RE = /thinking|размышл/i
export const FAST_MODE_RE = /fast|quick|быстр/i

// The "+" (mode) menu item that enables web search.
export const WEB_SEARCH_MENU_RE = /web search|поиск в интернет|веб-поиск/i

// Advisory probe selectors (the mode button is always present).
export const TOGGLE_SELECTORS = [
  THINKING_SELECTOR,
  '.mode-select-open',
  '[role="switch"]',
  'div[role="button"][aria-pressed]',
]
export const DEEP_THINKING_RE = /think|reason|размышл/i
export const WEB_SEARCH_RE = /search|поиск/i
