// Qwen Chat (chat.qwen.ai) provider — the second chat backend zames can
// drive, so the operator can switch models without switching tools.
//
// WHY a separate class instead of a flag in browser.ts: DeepSeek and Qwen
// differ in EVERY layer we touch — selectors, the send flow, the SSE format
// and the chat-id scheme. DeepSeekBrowser is already large; folding a second
// site into it would make both harder to audit. The shared surface is the
// ChatProvider interface (types.ts); the agent loop only needs BrowserLike and
// never sees either concrete class.
//
// Verified against a live session (headless Chromium, guest + logged in):
//   input  -> textarea.message-input-textarea
//   send   -> button.send-button
//   send   -> POST /api/v2/chats/new, then POST /api/v2/chat/completions?chat_id=…
//   answer -> SSE choices[].delta.content where phase != thinking_summary
// The site sits behind Alibaba's WAF, which is exactly why we drive a REAL
// browser: the page solves its own JS challenge and carries the tokens.

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'
import type { BrowserContext, Locator, Page } from 'playwright'
import { translate, DEFAULT_LOCALE } from './i18n.js'
import type { Locale } from './i18n.js'
import { rewriteFailedAttachments } from './commands.js'
import { awaitUploadPreview, readAttachBuffers } from './attach-flow.js'
import { theme } from './theme.js'
import type { ChatInfo, ChatMessage } from './types.js'
import {
  scrapeQwenChatList,
  scrapeQwenChatMessages,
  parseQwenChatList,
  parseQwenHistory,
} from './qwen-chats.js'
import {
  cleanAnswer,
  headlessEngineKey,
  readCachedHeadlessUA,
  writeCachedHeadlessUA,
  sanitizeHeadlessUA,
  cleanSingletonFiles,
  profileLooksLocked,
  nukeProfile,
  AUTH_MARKER_FILE,
} from './browser-pure.js'
import {
  chatSignalInDom,
  dumpDomCountsInDom,
  isElementEnabledInDom,
  readInputTrimmedTextInDom,
  readLastAnswerInDom,
  readPageToastsInDom,
  readUserAgentInDom,
  setBusyTitleInDom,
  clickStopInDom,
  stopButtonVisibleInDom,
} from './browser-dom.js'
import {
  probeUiHealth,
  type UiCapabilitySpec,
  type UiHealthResult,
  type UiProbePage,
} from './ui-health.js'
import {
  CHAT_URL,
  CHAT_ID_RE,
  chatUrl,
  INPUT_SELECTORS,
  SEND_SELECTORS,
  STOP_SELECTORS,
  STOP_NAME_RE,
  NEW_CHAT_SELECTOR,
  MODEL_TRIGGER_SELECTOR,
  MODELS_URL,
  CHAT_LIST_URL,
  chatHistoryUrl,
  AGE_GATE_MODAL,
  AGE_GATE_CONTINUE,
  AGE_GATE_YEAR_SELECT,
  AGE_GATE_YEAR_OPTION,
  COOKIE_ACCEPT_RE,
  ATTACH_SELECTORS,
  ATTACH_MENU_TRIGGER,
  ATTACH_MENU_ITEM_RE,
  THINKING_SELECTOR,
  THINKING_MODE_RE,
  FAST_MODE_RE,
  WEB_SEARCH_MENU_RE,
  ANSWER_SELECTORS,
  THINK_CLASS_RE,
  MESSAGE_CONTAINER_SELECTORS,
  ASSISTANT_CLASS_RE,
  CHAT_SIGNAL_NODES_SELECTOR,
  MARKDOWN_SELECTOR,
  TOGGLE_SELECTORS,
} from './qwen-ui.js'
import {
  extractAnswer,
  extractTokenUsage,
  isFinishedWithoutAnswer,
  isRateLimitText,
  isGuestLimitText,
  isServerBusyText,
} from './qwen-net-capture.js'

// A SEPARATE profile from DeepSeek's ~/.zames/profile. Two persistent Chromium
// contexts on ONE --user-data-dir cannot coexist (SingletonLock), and keeping
// Qwen's cookies apart also means switching providers never logs the other
// one out.
export const QWEN_USER_DATA_DIR = path.join(
  os.homedir(),
  '.zames',
  'qwen-profile',
)

// Escape a string for use inside a RegExp (the model id may carry dots).
function escapeRegExp(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CHAT_RE = /chat\.qwen\.ai/i
const ANSWER_URL_RE = /\/api\/v2\/chat\/completions/i
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// Cap the stored RAW SSE body. The truncated/no-answer detectors only read the
// markers (`quasi_status`, `finish_reason`) and the SLICE shown in errors
// (first/last 300 chars), so keeping a whole multi-MB stream in memory for the
// rest of the turn is wasteful. The first 64 KB is plenty for every marker we
// match; the tail (used in error messages) is kept by cutting the middle.
const MAX_NET_BODY = 64 * 1024
function capNetBody(body: string): string {
  if (body.length <= MAX_NET_BODY) return body
  const head = MAX_NET_BODY - 1024
  return body.slice(0, head) + '\n...[truncated]...\n' + body.slice(-1024)
}

// Qwen's sign-in is on the SAME origin as the chat (`chat.qwen.ai/auth`), so a
// page.evaluate can drive it. The DEFAULT flow is email -> a one-time code
// sent by mail ("Login with verification code"); a password form is available
// behind "Log in with a password". A guest has a small daily message quota
// and cannot upload files, so a real session matters for long runs.

export interface QwenBrowserOptions {
  headless?: boolean
  debug?: boolean
  channel?: string | null
  answerTimeoutMs?: number
  askRetries?: number
  stabilityChecks?: number
  stabilityDelayMs?: number
  minSendIntervalMs?: number
  rateLimitWaitMs?: number
  maxRateLimitRetries?: number
  maxServerBusyRetries?: number
  serverBusyWaitMs?: number
  maxIncompleteRetries?: number
  incompleteWaitMs?: number
  /**
   * How long to wait for the answer to START after a send (ms). Qwen's cold
   * guest turns can be slow, so this is more generous than DeepSeek's.
   */
  startWaitMs?: number
  /** How long to poll for a usable send button before falling back to Enter. */
  sendButtonWaitMs?: number
  /** Desired Qwen model id (from GET /api/v2/models/). Empty = site default. */
  model?: string
  deepThinking?: boolean
  webSearch?: boolean
  auth?: { username?: string; password?: string; saveSession?: boolean }
  locale?: Locale
  onAuthSave?: (username: string, password: string) => void
  userAgent?: string
}

export class QwenBrowser {
  providerName = 'qwen'
  headless: boolean
  debug: boolean
  channel: string | null
  answerTimeoutMs: number
  askRetries: number
  stabilityChecks: number
  stabilityDelayMs: number
  minSendIntervalMs: number
  rateLimitWaitMs: number
  maxRateLimitRetries: number
  maxServerBusyRetries: number
  serverBusyWaitMs: number
  maxIncompleteRetries: number
  incompleteWaitMs: number
  startWaitMs: number
  sendButtonWaitMs: number
  // The Qwen model id sent with each completion request. Empty means "let the
  // site pick" (its own default). Read from config, overridable with /model.
  model: string
  deepThinking: boolean
  webSearch: boolean
  auth: { username: string; password: string; saveSession: boolean }
  locale: Locale
  onAuthSave: ((username: string, password: string) => void) | null
  // Watchdog budget the agent loop reads (same contract as DeepSeekBrowser).
  maxAfterToolRetries: number
  askDeadlineMs: number
  _lastSentAt: number
  _abort: boolean
  _askCancelled: boolean
  _askInFlight: number
  _stopped: boolean
  context!: BrowserContext
  page!: Page
  _netCapture: string
  _netCaptureAt: number
  _netNoAnswer: boolean
  _netRateLimited: boolean
  // True when the guest daily limit was hit ("You've reached the guest chat
  // limit for today's usage"). Distinct from _netRateLimited: it cannot be
  // waited out, so ask() fails fast with a "log in" message.
  _netGuestLimit: boolean
  // True when the completion body carries the server-busy / service-unavailable
  // notice. Mirrors _netRateLimited: the DOM toast is short-lived, so the RAW
  // body is the reliable signal. ask() then backs off instead of waiting out
  // the whole answer deadline.
  _netServerBusy: boolean
  _netChatId: string | null
  _lastTokenUsage: number | null
  _toggles: { deepThinking: boolean; webSearch: boolean }
  // Last thinking mode / web-search state we actually APPLIED to the page. The
  // mode menu must NOT be opened on every send (it is slow and can steal focus
  // from the send button), so we only drive the UI when the DESIRED state
  // differs from what we last set. -1 = not applied yet this session.
  _appliedThinking: -1 | 0 | 1
  _appliedWebSearch: -1 | 0 | 1
  _apiAuth: string
  _lastHistoryError: string
  _netBody: string
  _netHookInstalled: boolean
  _netHookPage: unknown
  onSendStart: (() => void) | null
  onSendPause: ((seconds: number) => void) | null
  onSendState: ((state: 'generating' | 'paused' | 'settled') => void) | null
  onNotice: ((text: string) => void) | null
  userAgent: string

  constructor({
    headless = false,
    debug = false,
    channel = null,
    answerTimeoutMs = 180000,
    askRetries = 3,
    stabilityChecks = 2,
    stabilityDelayMs = 400,
    minSendIntervalMs = 15000,
    rateLimitWaitMs = 300000,
    maxRateLimitRetries = 6,
    maxServerBusyRetries = 5,
    serverBusyWaitMs = 3000,
    maxIncompleteRetries = 4,
    incompleteWaitMs = 2000,
    startWaitMs = 30000,
    sendButtonWaitMs = 8000,
    model = '',
    deepThinking = false,
    webSearch = true,
    auth,
    locale,
    onAuthSave,
    userAgent,
  }: QwenBrowserOptions = {}) {
    this.headless = headless
    this.debug = debug
    this.channel = channel
    this.answerTimeoutMs = answerTimeoutMs
    this.askRetries = askRetries
    this.stabilityChecks = stabilityChecks
    this.stabilityDelayMs = stabilityDelayMs
    this.minSendIntervalMs = minSendIntervalMs
    this.rateLimitWaitMs = rateLimitWaitMs
    this.maxRateLimitRetries = maxRateLimitRetries
    this.maxServerBusyRetries = maxServerBusyRetries
    this.serverBusyWaitMs = serverBusyWaitMs
    this.maxIncompleteRetries = maxIncompleteRetries
    this.incompleteWaitMs = incompleteWaitMs
    this.startWaitMs = startWaitMs
    this.sendButtonWaitMs = sendButtonWaitMs
    this.model = model
    this.deepThinking = deepThinking
    this.webSearch = webSearch
    this.auth = {
      username: (auth?.username || '').trim(),
      password: auth?.password || '',
      saveSession: auth?.saveSession !== false,
    }
    this.locale = locale || DEFAULT_LOCALE
    this.onAuthSave = onAuthSave || null
    this.maxAfterToolRetries = 6
    this.askDeadlineMs = answerTimeoutMs + 60000
    this._lastSentAt = 0
    this._abort = false
    this._askCancelled = false
    this._askInFlight = 0
    this._stopped = false
    this._netCapture = ''
    this._netCaptureAt = 0
    this._netNoAnswer = false
    this._netRateLimited = false
    this._netGuestLimit = false
    this._netServerBusy = false
    this._netChatId = null
    this._lastTokenUsage = null
    this._toggles = { deepThinking, webSearch }
    this._appliedThinking = -1
    this._appliedWebSearch = -1
    this._apiAuth = ''
    this._lastHistoryError = ''
    this._netBody = ''
    this._netHookInstalled = false
    this._netHookPage = null
    this.onSendStart = null
    this.onSendPause = null
    this.onSendState = null
    this.onNotice = null
    this.userAgent = userAgent || ''
  }

  _t(key: string, params?: Record<string, string | number>): string {
    return translate(this.locale)(key, { provider: 'Qwen', ...params })
  }

  setLocale(locale: Locale): void {
    if (locale) this.locale = locale
  }

  _notice(text: string): void {
    if (this.onNotice) {
      try {
        this.onNotice(text)
        return
      } catch {}
    }
    console.error(text)
  }

  _emitSendState(state: 'generating' | 'paused' | 'settled'): void {
    if (this.onSendState) {
      try {
        this.onSendState(state)
      } catch {}
    }
  }

  async _setBusyTitle(busy: boolean): Promise<void> {
    try {
      await this.page.evaluate(setBusyTitleInDom, busy)
    } catch {}
  }

  sendIntervalMs(): number {
    return this.minSendIntervalMs
  }

  // ---------- lifecycle ----------

  async launch(): Promise<void> {
    if (await profileLooksLocked(QWEN_USER_DATA_DIR)) {
      if (this.debug) console.error('qwen profile: removing Singleton files')
      await cleanSingletonFiles(QWEN_USER_DATA_DIR)
    }
    if (this.headless && !this.userAgent) {
      const cached = await readCachedHeadlessUA(headlessEngineKey() + ':qwen')
      if (cached) this.userAgent = cached
    }
    await this._launchOnce()
    await this._fixHeadlessUserAgent()
  }

  // A headless Chromium sends "HeadlessChrome/…", and Alibaba's WAF (like
  // DeepSeek's CDN) is far more suspicious of it than of a normal Chrome UA.
  // Strip only the marker; an explicit UA from the config always wins.
  async _fixHeadlessUserAgent(): Promise<void> {
    if (!this.headless) return
    if (this.userAgent) return
    try {
      const ua: string = await this.page.evaluate(readUserAgentInDom)
      const fixed = sanitizeHeadlessUA(ua)
      if (fixed === ua) return
      this.userAgent = fixed
      void writeCachedHeadlessUA(headlessEngineKey() + ':qwen', fixed)
      if (this.debug)
        console.error(
          'qwen profile: headless UA -> relaunching plain Chrome UA',
        )
      await this.context.close().catch(() => {})
      await this._launchOnce()
    } catch (e) {
      if (this.debug)
        console.error('qwen profile: UA fix failed:', (e as Error).message)
    }
  }

  async _launchOnce(): Promise<void> {
    const options: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: this.headless,
      slowMo: 10,
      args: ['--disable-blink-features=AutomationControlled'],
    }
    if (this.channel) options.channel = this.channel
    if (this.userAgent) options.userAgent = this.userAgent

    try {
      this.context = await chromium.launchPersistentContext(
        QWEN_USER_DATA_DIR,
        options,
      )
    } catch (e) {
      if (/profile.*in use|has been closed/i.test((e as Error).message)) {
        await cleanSingletonFiles(QWEN_USER_DATA_DIR)
        try {
          this.context = await chromium.launchPersistentContext(
            QWEN_USER_DATA_DIR,
            options,
          )
        } catch {
          await nukeProfile(QWEN_USER_DATA_DIR)
          this.context = await chromium.launchPersistentContext(
            QWEN_USER_DATA_DIR,
            options,
          )
        }
      } else {
        throw e
      }
    }

    this.page = this.context.pages()[0] || (await this.context.newPage())
    this._installNetHook()
    // A slow network (or a cold CDN) can make the initial navigation exceed
    // Playwright's 30s goto timeout. That must NOT abort launch(): the page is
    // usually already usable, and every later step (_awaitInput, waitForLogin)
    // polls. Bailing out here turned a transient slowness into a hard startup
    // failure.
    await this.page
      .goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
      .catch(() => {})
    await this._dismissOverlays()
  }

  async restart(): Promise<void> {
    try {
      if (this.context) await this.context.close()
    } catch {}
    await this._launchOnce()
    await this._fixHeadlessUserAgent()
  }

  // The cookie banner and the age-confirmation modal sit OVER the input on a
  // first visit; a click on the input would hit the overlay instead. Both are
  // dismissed best-effort before any interaction.
  async _dismissOverlays(): Promise<void> {
    try {
      await this.page
        .getByRole('button', { name: COOKIE_ACCEPT_RE })
        .first()
        .click({ timeout: 1500 })
        .catch(() => {})
      const gate = this.page.locator(AGE_GATE_MODAL)
      if (await gate.count().catch(() => 0)) {
        // The gate has a YEAR dropdown (default already set) plus Continue.
        // A raw click on Continue can be a no-op until a year is committed,
        // so open the dropdown and pick an option FIRST, then Continue — and
        // finally verify the modal actually closed. Verified live: the year
        // must be selected via the trigger (clicking the label does nothing).
        await this.page
          .locator(AGE_GATE_YEAR_SELECT)
          .first()
          .click({ timeout: 2000 })
          .catch(() => {})
        await this.page.waitForTimeout(400)
        const opt = this.page.locator(AGE_GATE_YEAR_OPTION).first()
        if (await opt.count().catch(() => 0)) {
          await opt.click({ timeout: 2000 }).catch(() => {})
          await this.page.waitForTimeout(300)
        }
        await this.page
          .locator(AGE_GATE_CONTINUE)
          .first()
          .click({ timeout: 2000 })
          .catch(() => {})
        await this.page.waitForTimeout(400)
      }
    } catch {}
  }

  async close(): Promise<void> {
    try {
      if (this.context) await this.context.close()
    } catch {}
  }

  _installNetHook(): void {
    const pg = this.page
    if (!pg) return
    if (this._netHookInstalled && this._netHookPage === pg) return
    this._netHookInstalled = true
    this._netHookPage = pg
    pg.on('response', (resp) => {
      void this._onResponse(resp).catch(() => {})
    })
    // Sniff the bearer token off Qwen's own API calls. A bare fetch from our
    // code does not carry it (the app reads it from its own storage).
    pg.on('request', (req) => {
      try {
        const url = req.url()
        if (!/qwen\.ai\/api\//i.test(url)) return
        const h = req.headers()
        if (h['authorization']) this._apiAuth = h['authorization']
      } catch {}
    })
  }

  async _onResponse(resp: import('playwright').Response): Promise<void> {
    try {
      const url = resp.url()
      if (!CHAT_RE.test(url)) return
      if (/\.(js|css|png|jpg|jpeg|svg|woff2?|ico|map|webp)(\?|$)/i.test(url))
        return
      const ct = (resp.headers()['content-type'] || '').toLowerCase()
      const interesting =
        ct.includes('event-stream') ||
        ct.includes('json') ||
        ct.includes('text/plain')
      if (!interesting) return

      const body = await resp.text().catch(() => '')
      if (!body) return

      const usage = extractTokenUsage(body)
      if (usage !== null) this._lastTokenUsage = usage

      // The GUEST daily limit can arrive from ANY qwen API endpoint
      // (getstsToken during an upload, or completions). Flag it regardless of
      // the URL so ask() can fail fast with a "log in" message instead of
      // retrying for `rateLimitWaitMs` (which cannot help — it resets
      // tomorrow).
      if (isGuestLimitText(body)) {
        this._netGuestLimit = true
        this._netBody = capNetBody(body)
        this._netCaptureAt = Date.now()
      }

      const isAnswerUrl = ANSWER_URL_RE.test(url)
      if (!isAnswerUrl) return

      const extracted = extractAnswer(body)
      if (extracted) {
        this._netCapture = extracted
        this._netNoAnswer = false
        this._netCaptureAt = Date.now()
      }
      if (this._askInFlight === 0) {
        // A completion arrived with no ask of ours in flight: the operator
        // sent it by hand. Bump the throttle so our next send waits.
        this._lastSentAt = Date.now()
      }
      this._netBody = capNetBody(body)
      const cid = body.match(UUID_RE)
      if (cid) this._netChatId = cid[0]
      if (!extracted) {
        if (isFinishedWithoutAnswer(body)) {
          this._netNoAnswer = true
          this._netCapture = ''
        }
        if (isRateLimitText(body)) {
          this._netRateLimited = true
          this._netCapture = ''
        }
        // The server-busy notice can arrive with a non-empty (partial) answer
        // too, so it is checked OUTSIDE the `!extracted` branch as well — the
        // point is to back off, not to discard a usable answer.
        if (isServerBusyText(body)) {
          this._netServerBusy = true
        }
        this._netCaptureAt = Date.now()
      }
    } catch {}
  }

  // ---------- login ----------

  // Are we signed in? Detected from the PAGE, the same way a human sees it: a
  // signed-out visitor has the header "Log in" / "Sign up" buttons, a signed-in
  // one shows the account menu instead. The `auths/refresh` API was the first
  // choice, but it answers `Bad_Request: Invalid request header` without the
  // app's own header, so it cannot be used from a bare fetch — the DOM check is
  // reliable and needs no secret header.
  //
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false
    // POLL until the chat UI has HYDRATED and the header settles: the React app
    // renders the guest CTA for a moment on a cold page and only then swaps in
    // the account menu, so a single early probe reported "guest" on a genuinely
    // signed-in session. A real guest keeps the CTA forever, so it correctly
    // ends as false at the deadline; a signed-in session matches within a few
    // seconds.
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      try {
        const input = await this.page
          .locator(INPUT_SELECTORS.join(', '))
          .count()
          .catch(() => 0)
        if (input > 0) {
          const login = await this.page
            .getByRole('button', { name: /^\s*log ?in\s*$/i })
            .count()
            .catch(() => 0)
          const signup = await this.page
            .getByRole('button', { name: /^\s*sign ?up\s*$/i })
            .count()
            .catch(() => 0)
          if (login === 0 && signup === 0) return true
        }
      } catch {}
      await this.page.waitForTimeout(500)
    }
    return false
  }

  async waitForLogin(): Promise<void> {
    if (await this.isLoggedIn()) {
      if (this.debug) console.error('qwen auth: session already active')
      await this._persistSessionIfNeeded()
      return
    }
    // No stored session: Qwen still answers a GUEST for a limited number of
    // turns, but the agent is multi-turn by nature, so a real login is
    // strongly recommended. Try the saved credentials first, then ask the
    // operator in a TTY.
    if (this.auth.username) {
      if (await this._autoLogin()) {
        await this._persistSessionIfNeeded()
        return
      }
    }
    if (process.stdin.isTTY) {
      await this._promptAndLogin()
    } else {
      this._notice(this._t('qwen.guest_mode'))
    }
    await this._persistSessionIfNeeded()
  }

  async _persistSessionIfNeeded(): Promise<void> {
    if (!this.auth.saveSession) return
    if (!(await this.isLoggedIn())) return
    try {
      await fs.mkdir(path.dirname(AUTH_MARKER_FILE), { recursive: true })
      await fs.writeFile(
        AUTH_MARKER_FILE,
        JSON.stringify({ provider: 'qwen', at: new Date().toISOString() }),
        'utf-8',
      )
    } catch {}
  }

  // Best-effort PASSWORD login for the saved credentials. Qwen's default form
  // is the email CODE flow, so this first switches to the password form (the
  // "Log in with a password" link) and only then fills email + password. A
  // password-less flow cannot be automated (it needs the emailed code, which
  // only the operator can read), so that path is handled interactively in
  // _promptAndLogin().
  // Password login (the verified flow): open the auth page, fill the email,
  // switch to the password form via "Log in with a password", fill the
  // password and submit. This is preferred over the email-CODE flow when a
  // password is saved, because the code needs the operator to read the mail.
  async _autoLogin(): Promise<boolean> {
    if (!this.auth.password || !this.auth.username) return false
    try {
      await this._openLoginPage()
      // 1) email first (the form starts in the CODE mode)
      const email = this.page
        .locator('input[name="email"], input[type="email"]')
        .first()
      await email.waitFor({ state: 'visible', timeout: 8000 })
      await email.fill(this.auth.username)
      // 2) switch to the password form, then fill the password
      await this._switchToPasswordForm()
      const pwd = this.page.locator('input[type="password"]').first()
      if ((await pwd.count().catch(() => 0)) === 0) {
        // The password form did not appear: fall back to the code flow.
        return false
      }
      await pwd.fill(this.auth.password)
      await this._clickSubmit()
      const ok = await this._waitLoggedIn(20000)
      if (ok) this._notice(this._t('qwen.login_ok'))
      return ok
    } catch (e) {
      if (this.debug)
        console.error('qwen auto-login failed:', (e as Error).message)
      return false
    }
  }

  // Click the login/submit button (label varies: Log in / Continue).
  async _clickSubmit(): Promise<void> {
    const btn = this.page
      .getByRole('button', { name: /^\s*(log ?in|sign ?in|continue)\s*$/i })
      .first()
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 4000 }).catch(() => {})
    } else {
      await this.page.keyboard.press('Enter').catch(() => {})
    }
    await this.page.waitForTimeout(1500)
  }

  // Interactive login: email -> "Continue" -> Qwen mails a one-time code ->
  // ask the operator for it in the terminal -> submit -> verify via the API.
  // This is the DEFAULT Qwen flow (no password needed).
  async _promptAndLogin(): Promise<boolean> {
    await this._openLoginPage()
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const email = await new Promise<string>((resolve) =>
      rl.question(
        this._t('qwen.login_email_prompt', {
          def: this.auth.username ? ' [' + this.auth.username + ']' : '',
        }),
        resolve,
      ),
    )
    rl.close()
    const addr = email.trim() || this.auth.username
    if (!addr) {
      this._notice(this._t('qwen.login_failed'))
      return false
    }
    let ok: boolean
    try {
      await this._fillEmailAndContinue(addr)
      await this.page.waitForTimeout(1500)
      const rlCode = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      const code = await new Promise<string>((resolve) =>
        rlCode.question(this._t('qwen.login_code_prompt'), resolve),
      )
      rlCode.close()
      await this._submitCode(code.trim())
      ok = await this._waitLoggedIn(30000)
    } catch (e) {
      if (this.debug) console.error('qwen login failed:', (e as Error).message)
      ok = false
    }
    if (ok) {
      this._notice(this._t('qwen.login_ok'))
      if (this.onAuthSave) {
        try {
          this.onAuthSave(addr, '')
        } catch {}
      }
    } else {
      this._notice(this._t('qwen.login_failed'))
    }
    return ok
  }

  // Open the login form. Qwen's sign-in lives on the SAME origin
  // (chat.qwen.ai/auth); a direct navigation is the reliable path (the header
  // "Log in" button opens the same page).
  async _openLoginPage(): Promise<void> {
    try {
      if (!/\/auth(\b|$|\?)/i.test(this.page.url())) {
        const btn = this.page
          .getByRole('button', { name: /log ?in|sign ?in/i })
          .first()
        if (await btn.count().catch(() => 0)) {
          await btn.click({ timeout: 3000 }).catch(() => {})
          await this.page.waitForTimeout(2000)
        }
      }
      if (!/chat\.qwen\.ai\/auth/i.test(this.page.url())) {
        await this.page
          .goto('https://chat.qwen.ai/auth', {
            waitUntil: 'domcontentloaded',
          })
          .catch(() => {})
        await this.page.waitForTimeout(2500)
      }
    } catch {}
  }

  async _fillEmailAndContinue(email: string): Promise<void> {
    const input = this.page
      .locator('input[name="email"], input[type="email"]')
      .first()
    await input.waitFor({ state: 'visible', timeout: 8000 })
    await input.fill(email)
    await this._clickContinue()
  }

  async _clickContinue(): Promise<void> {
    const btn = this.page
      .getByRole('button', { name: /^\s*continue\s*$/i })
      .first()
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 4000 }).catch(() => {})
    } else {
      await this.page.keyboard.press('Enter')
    }
    await this.page.waitForTimeout(2000)
  }

  // Switch from the default code form to the password form (the
  // "Log in with a password" link). Best-effort: a build without the link
  // simply keeps the code form, and _autoLogin() bails out.
  async _switchToPasswordForm(): Promise<void> {
    try {
      const link = this.page.getByText(/log in with a password/i).first()
      if (await link.count().catch(() => 0)) {
        await link.click({ timeout: 3000 }).catch(() => {})
        await this.page.waitForTimeout(1500)
      }
    } catch {}
  }

  // Submit the one-time code. Qwen renders EITHER six single-character boxes
  // OR one code input; handle both. Best-effort (the exact markup may change).
  async _submitCode(code: string): Promise<void> {
    try {
      const digits = code.replace(/[^0-9a-zA-Z]/g, '')
      const sel =
        'input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="1"], input[type="tel"], input[type="text"]'
      const inputs = this.page.locator(sel)
      const n = await inputs.count().catch(() => 0)
      if (n >= digits.length && n > 1) {
        for (let i = 0; i < digits.length; i++) {
          await inputs
            .nth(i)
            .fill(digits[i])
            .catch(() => {})
        }
      } else {
        await inputs
          .first()
          .fill(digits)
          .catch(() => {})
      }
      await this.page.keyboard.press('Enter')
      const submit = this.page
        .getByRole('button', {
          name: /^\s*(continue|verify|submit|log ?in|sign ?in)\s*$/i,
        })
        .first()
      if (await submit.count().catch(() => 0)) {
        await submit.click({ timeout: 3000 }).catch(() => {})
      }
    } catch {}
  }

  async _waitLoggedIn(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.isLoggedIn()) return true
      await this.page.waitForTimeout(800)
    }
    return false
  }

  // ---------- chat management ----------

  async newChat(): Promise<void> {
    const before = await this.getCurrentChatId()
    const btn = this.page.locator(NEW_CHAT_SELECTOR).first()
    let clicked = false
    try {
      await btn.click({ timeout: 2500 })
      clicked = true
    } catch {}
    let ok = false
    if (clicked) {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const now = await this.getCurrentChatId()
        if (now !== before) {
          ok = true
          break
        }
        await this.page.waitForTimeout(100)
      }
    }
    if (!ok) {
      await this.page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
      await this._awaitInput(5000)
    }
    this._netChatId = null
    this._lastTokenUsage = null
  }

  async _awaitInput(timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const input = await this._findVisible(INPUT_SELECTORS, 500)
      if (input) return true
      await this.page.waitForTimeout(150)
    }
    return false
  }

  async _findVisible(
    selectors: string[],
    timeout = 1000,
  ): Promise<Locator | null> {
    for (const sel of selectors) {
      try {
        const loc = this.page.locator(sel).last()
        if ((await loc.count()) === 0) continue
        if (await loc.isVisible({ timeout }).catch(() => false)) return loc
      } catch {}
    }
    return null
  }

  async listChats(limit = 30): Promise<ChatInfo[]> {
    if (!this.page) return []
    // Primary: the API the app itself uses (verified on a signed-in session) —
    // it returns the whole list, while the sidebar only renders a window.
    try {
      const res = await this.page.evaluate(
        async (opts: { url: string; auth: string }) => {
          try {
            const headers: Record<string, string> = {
              accept: 'application/json',
            }
            if (opts.auth) headers['authorization'] = opts.auth
            const r = await fetch(opts.url, {
              credentials: 'include',
              headers,
            })
            if (!r.ok) return { error: 'HTTP ' + r.status, data: null }
            return { error: '', data: await r.json() }
          } catch (e) {
            return { error: (e as Error).message, data: null }
          }
        },
        { url: CHAT_LIST_URL, auth: this._apiAuth },
      )
      if (!res?.error) {
        const list = parseQwenChatList(res.data).slice(0, limit)
        if (list.length) return list
      } else {
        this._lastHistoryError = res.error
      }
    } catch {}
    // Fallback: scrape the sidebar (works for a guest with a rendered list).
    await this._ensureSidebarOpen()
    try {
      return await this.page.evaluate(scrapeQwenChatList, limit)
    } catch {
      return []
    }
  }

  // Best-effort: click a sidebar/\"all chats\" toggle so the chat list is
  // rendered before scraping. Matches a couple of likely accessible names.
  async _ensureSidebarOpen(): Promise<void> {
    for (const name of [/all chats/i, /history/i, /sidebar/i, /чаты/i]) {
      try {
        const btn = this.page.getByRole('button', { name }).first()
        if ((await btn.count().catch(() => 0)) === 0) continue
        if (!(await btn.isVisible().catch(() => false))) continue
        await btn.click({ timeout: 1500 }).catch(() => {})
        await this.page.waitForTimeout(500)
        return
      } catch {}
    }
  }

  async openChat(id: string): Promise<boolean> {
    try {
      await this.page.goto(chatUrl(id), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        if ((await this.getCurrentChatId()) === id) {
          await this._awaitInput(2000)
          return true
        }
        await this.page.waitForTimeout(100)
      }
      return false
    } catch {
      return false
    }
  }

  // Qwen does not document a stable history endpoint we can rely on, so this
  // is best-effort: try the chats API, then fall back to DOM scraping in
  // readChatMessages(). A failure never breaks the restore.

  // The model catalogue (GET /api/v2/models/) so /model can list and pick a
  // model without leaving the terminal. Requested from INSIDE the page so the
  // WAF cookies/bearer token are the browser's.
  async listModels(): Promise<Array<{ id: string; name: string }>> {
    if (!this.page) return []
    try {
      const res = await this.page.evaluate(
        async (opts: { url: string; auth: string }) => {
          try {
            const headers: Record<string, string> = {
              accept: 'application/json',
            }
            if (opts.auth) headers['authorization'] = opts.auth
            const r = await fetch(opts.url, { credentials: 'include', headers })
            if (!r.ok) return { error: 'HTTP ' + r.status, data: null }
            return { error: '', data: await r.json() }
          } catch (e) {
            return { error: (e as Error).message, data: null }
          }
        },
        { url: MODELS_URL, auth: this._apiAuth },
      )
      if (res?.error) {
        this._lastHistoryError = res.error
        // Surface the failure: an empty list otherwise looks identical to
        // "the catalogue is empty", so /model would print "(none)" with no
        // hint that the API call failed.
        this._notice(this._t('qwen.model_error', { v: res.error }))
        return []
      }
      const data = (res?.data as Record<string, unknown>) || {}
      // The catalogue is nested: { success, data: { data: [ {id, name, …} ] } }.
      // Accept a flat { data: [...] } too, since the shape has changed before.
      const lvl1 = data?.data
      const list = Array.isArray(lvl1)
        ? (lvl1 as unknown[])
        : lvl1 &&
            typeof lvl1 === 'object' &&
            Array.isArray((lvl1 as Record<string, unknown>).data)
          ? ((lvl1 as Record<string, unknown>).data as unknown[])
          : []
      const out: Array<{ id: string; name: string }> = []
      for (const m of list) {
        if (!m || typeof m !== 'object') continue
        const mm = m as Record<string, unknown>
        const id = typeof mm.id === 'string' ? mm.id : ''
        const info = mm.info as Record<string, unknown> | undefined
        const meta = info?.meta as Record<string, unknown> | undefined
        const name =
          (typeof meta?.name === 'string' && meta.name) ||
          (typeof mm.name === 'string' && mm.name) ||
          id
        if (id) out.push({ id, name })
      }
      return out
    } catch (e) {
      this._lastHistoryError = (e as Error).message
      this._notice(this._t('qwen.model_error', { v: (e as Error).message }))
      return []
    }
  }

  // Fetch one chat's history via the app's OWN endpoint
  // `GET /api/v2/chats/<id>?direction=up&limit=N` (verified live on a
  // signed-in session). Parsed by the PURE parseQwenHistory() so the shape
  // handling is unit-tested and can drift without touching this method.
  async fetchChatMessages(id: string): Promise<ChatMessage[]> {
    this._lastHistoryError = ''
    if (!this.page || !id) return []
    try {
      const res = await this.page.evaluate(
        async (opts: { url: string; auth: string }) => {
          try {
            const headers: Record<string, string> = {
              accept: 'application/json',
            }
            if (opts.auth) headers['authorization'] = opts.auth
            const r = await fetch(opts.url, {
              credentials: 'include',
              headers,
            })
            if (!r.ok) return { error: 'HTTP ' + r.status, data: null }
            return { error: '', data: await r.json() }
          } catch (e) {
            return { error: (e as Error).message, data: null }
          }
        },
        { url: chatHistoryUrl(id, 50), auth: this._apiAuth },
      )
      if (res?.error) {
        this._lastHistoryError = res.error
        return []
      }
      return parseQwenHistory(res.data)
    } catch (e) {
      this._lastHistoryError = (e as Error).message
      return []
    }
  }

  async readChatMessages(): Promise<ChatMessage[]> {
    if (!this.page) return []
    try {
      return await this.page.evaluate(scrapeQwenChatMessages, {
        containerSels: MESSAGE_CONTAINER_SELECTORS,
        thinkRe: THINK_CLASS_RE.source,
        assistantRe: ASSISTANT_CLASS_RE.source,
      })
    } catch {
      return []
    }
  }

  async getCurrentChatId(): Promise<string | null> {
    try {
      const m = this.page.url().match(CHAT_ID_RE)
      if (m && m[1] !== 'guest') return m[1]
      return this._netChatId
    } catch {
      return this._netChatId
    }
  }

  getLastTokenUsage(): number | null {
    return this._lastTokenUsage
  }

  // ---------- answer reading ----------

  async _readLastAnswerText(): Promise<string> {
    if (this._netCapture && this._netCaptureAt >= this._lastSentAt) {
      return this._netCapture
    }
    return await this._readLastAnswerTextDom()
  }

  async _readLastAnswerTextDom(): Promise<string> {
    return await this.page.evaluate(readLastAnswerInDom, {
      sels: ANSWER_SELECTORS,
      thinkRe: THINK_CLASS_RE.source,
    })
  }

  async _readPageText(): Promise<string> {
    return await this.page.evaluate(readPageToastsInDom).catch(() => '')
  }

  async _readLastAnswerTextCleanDom(): Promise<string> {
    const raw = await this._readLastAnswerTextDom().catch(() => '')
    return this._cleanAnswer(raw)
  }

  _cleanAnswer(raw: string): string {
    return cleanAnswer(raw)
  }

  async _stopButtonVisible(): Promise<boolean> {
    const explicit = await this._findVisible(STOP_SELECTORS, 250)
    if (explicit) return true
    return await this.page
      .evaluate(stopButtonVisibleInDom, 'send-button|stop-button')
      .catch(() => false)
  }

  async _chatSignal(): Promise<{ nodes: number; lastLen: number }> {
    return await this.page
      .evaluate(chatSignalInDom, {
        nodesSel: CHAT_SIGNAL_NODES_SELECTOR,
        mdSel: MARKDOWN_SELECTOR,
      })
      .catch(() => ({ nodes: 0, lastLen: 0 }))
  }

  async stopGeneration(): Promise<boolean> {
    this._abort = true
    this._stopped = true
    try {
      const loc = this.page.getByRole('button', { name: STOP_NAME_RE })
      const n = await loc.count().catch(() => 0)
      for (let i = 0; i < n; i++) {
        const b = loc.nth(i)
        if (await b.isVisible().catch(() => false)) {
          await b.click({ timeout: 2000 })
          return true
        }
      }
    } catch {}
    const btn = await this._findVisible(STOP_SELECTORS, 500)
    if (btn) {
      try {
        await btn.click({ timeout: 1500 })
        return true
      } catch {}
    }
    const clicked = await this.page
      .evaluate(clickStopInDom, 'send-button|stop-button')
      .catch(() => false)
    if (clicked) return true
    try {
      await this.page.keyboard.press('Escape')
      return true
    } catch {}
    return false
  }

  // ---------- toggles (model thinking / search) ----------

  getToggleStatesSync(): { deepThinking: boolean; webSearch: boolean } {
    return this._toggles
  }

  setToggleState(s: { deepThinking?: boolean; webSearch?: boolean }): void {
    if (typeof s.deepThinking === 'boolean')
      this._toggles.deepThinking = s.deepThinking
    if (typeof s.webSearch === 'boolean') this._toggles.webSearch = s.webSearch
  }

  async getToggleStates(): Promise<{
    deepThinking: boolean
    webSearch: boolean
  }> {
    return {
      deepThinking: this.deepThinking,
      webSearch: this.webSearch,
    }
  }

  // Qwen's thinking is a MODE selector (Auto / Thinking / Fast), and web search
  // is an item in the "+" (mode) menu — unlike DeepSeek's two boolean toggles.
  // Map the config onto Qwen's UI: deepThinking ON -> "Thinking", OFF -> "Auto"
  // (the smart default); webSearch ON -> enable the "Web search" menu item.
  // Everything is best-effort: a missing control never fails the send.
  async _applyToggles(): Promise<void> {
    this._toggles = {
      deepThinking: this.deepThinking,
      webSearch: this.webSearch,
    }
    await this._applyModel()
    await this._applyThinkingMode()
    await this._applyWebSearch()
  }

  // Pick Auto/Thinking/Fast in the `.qwen-thinking-selector` dropdown. The
  // option labels are localized, so they are matched by a loose regex.
  async _applyThinkingMode(): Promise<void> {
    // Only touch the mode dropdown when the desired state changed since the
    // last apply (same rationale as _applyWebSearch): opening it on every send
    // is slow and can steal focus from the send button. A manual flip by the
    // operator is still honored because we re-read the current label below.
    const wantMode = this.deepThinking ? 1 : 0
    if (this._appliedThinking === wantMode) return
    try {
      const trigger = this.page.locator(THINKING_SELECTOR).first()
      if ((await trigger.count().catch(() => 0)) === 0) return
      const wantRe = this.deepThinking ? THINKING_MODE_RE : FAST_MODE_RE
      const cur = ((await trigger.innerText().catch(() => '')) || '').trim()
      // Already in the wanted mode? (Auto counts as "not thinking", so it
      // satisfies deepThinking=false; only a real switch needs a click.)
      const curIsThinking = THINKING_MODE_RE.test(cur)
      if (curIsThinking === this.deepThinking) {
        this._appliedThinking = this.deepThinking ? 1 : 0
        return
      }
      await trigger.click({ timeout: 2000 }).catch(() => {})
      await this.page.waitForTimeout(300)
      const ok = await this._clickMenuOption(wantRe)
      if (ok) this._appliedThinking = this.deepThinking ? 1 : 0
    } catch {}
  }

  // Enable web search via the "+" (mode) menu item, reading its selected state
  // first so a manual choice is not flipped back. The item shows a check/active
  // class when on; we click only on a mismatch.
  async _applyWebSearch(): Promise<void> {
    // Only open the mode menu when the desired state changed since the last
    // apply: opening it on every send is slow and can steal focus from the
    // send button. A manual flip by the operator is still honored because we
    // re-read the item's selected state below the first time.
    const wantWs = this.webSearch ? 1 : 0
    if (this._appliedWebSearch === wantWs) return
    try {
      const trigger = this.page.locator(ATTACH_MENU_TRIGGER).first()
      if ((await trigger.count().catch(() => 0)) === 0) return
      await trigger.click({ timeout: 2000 }).catch(() => {})
      await this.page.waitForTimeout(400)
      const item = this.page.getByText(WEB_SEARCH_MENU_RE).first()
      if ((await item.count().catch(() => 0)) === 0) {
        await this.page.keyboard.press('Escape').catch(() => {})
        return
      }
      // Read the selected state from the item's own / ancestor class.
      const on = await item
        .evaluate((el: Element) => {
          let n: Element | null = el
          for (let i = 0; i < 4 && n; i++) {
            const cls = (n.className || '').toString()
            if (/selected|active|checked|chosen/i.test(cls)) return true
            n = n.parentElement
          }
          return false
        })
        .catch(() => null)
      if (on === null) {
        await this.page.keyboard.press('Escape').catch(() => {})
        return
      }
      if (on !== this.webSearch) {
        await item.click({ timeout: 2000 }).catch(() => {})
        await this.page.waitForTimeout(300)
      }
      this._appliedWebSearch = wantWs
      // Close the menu (the send button lives behind it).
      await this.page.keyboard.press('Escape').catch(() => {})
    } catch {}
  }

  // Click the first visible menu option whose label matches `labelRe`.
  async _clickMenuOption(labelRe: RegExp): Promise<boolean> {
    const opt = this.page
      .locator(
        '[class*="dropdown-menu-item"], [role="option"], [role="menuitem"], li',
      )
      .filter({ hasText: labelRe })
      .first()
    if ((await opt.count().catch(() => 0)) > 0) {
      await opt.click({ timeout: 2000 }).catch(() => {})
      return true
    }
    await this.page.keyboard.press('Escape').catch(() => {})
    return false
  }

  // Select the configured model in Qwen's header dropdown. The site builds the
  // completion request from ITS OWN UI state, so switching the model means
  // driving the `.wms-trigger` menu, not sending a field. Match the option by
  // a NORMALIZED label (strip non-alphanumerics, lowercase) so the config id
  // `qwen3.7-plus` matches the displayed name `Qwen3.7-Plus`. Best-effort: a
  // missing dropdown/option never fails the send.
  async _applyModel(): Promise<void> {
    if (!this.model) return
    const norm = (s: string): string =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    const want = norm(this.model)
    if (!want) return
    try {
      const trigger = this.page.locator(MODEL_TRIGGER_SELECTOR).first()
      if ((await trigger.count().catch(() => 0)) === 0) return
      const current = norm((await trigger.innerText().catch(() => '')) || '')
      if (current === want) return
      await trigger.click({ timeout: 2000 }).catch(() => {})
      await this.page.waitForTimeout(300)
      const option = this.page
        .locator('li, [role="option"], [class*="option"], [class*="item"]')
        .filter({ hasText: new RegExp(escapeRegExp(this.model), 'i') })
        .first()
      if ((await option.count().catch(() => 0)) > 0) {
        await option.click({ timeout: 2000 }).catch(() => {})
      } else {
        // Fall back to a normalized text scan (the option label may differ in
        // punctuation from the config id).
        const clicked = await this.page
          .evaluate((w: string) => {
            const norm = (s: string): string =>
              (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
            for (const el of Array.from(
              document.querySelectorAll(
                'li, [role="option"], [class*="option"], [class*="item"], div',
              ),
            )) {
              const t = (el.textContent || '').trim()
              if (t && norm(t) === w) {
                ;(el as HTMLElement).click()
                return true
              }
            }
            return false
          }, want)
          .catch(() => false)
        if (!clicked) await this.page.keyboard.press('Escape').catch(() => {})
      }
    } catch {}
  }

  // ---------- diagnostics ----------

  async dumpDom(
    filePath: string,
  ): Promise<{ file: string; selectors: unknown }> {
    if (!this.page) throw new Error('qwen: browser not launched')
    const html = await this.page.content()
    await fs.writeFile(filePath, html, 'utf-8')
    const report = await this.page.evaluate(dumpDomCountsInDom, {
      answers: ANSWER_SELECTORS,
      stops: STOP_SELECTORS,
      inputs: INPUT_SELECTORS,
    })
    return { file: filePath, selectors: report }
  }

  // Qwen's send button (`button.send-button`) appears ONLY after the input has
  // text — on an idle page it is replaced by the voice-mode control. Probing it
  // at startup would therefore always report a false negative, so it is NOT
  // probed (like DeepSeek's transient Stop/answer nodes). The INPUT is the
  // critical always-present control; new-chat and toggles are advisory.
  _uiCapabilities(): UiCapabilitySpec[] {
    return [
      { capability: 'input', selectors: INPUT_SELECTORS, critical: true },
      { capability: 'toggles', selectors: TOGGLE_SELECTORS, critical: false },
      {
        capability: 'newChat',
        selectors: [NEW_CHAT_SELECTOR],
        critical: false,
      },
    ]
  }

  async probeUiHealth(): Promise<UiHealthResult> {
    if (!this.page) {
      return { ok: false, present: [], missing: [], missingCritical: [] }
    }
    const page: UiProbePage = {
      count: (sel) => this.page.locator(sel).count(),
      countByText: (sel, textRe) =>
        this.page.locator(sel).filter({ hasText: textRe }).count(),
    }
    return await probeUiHealth(page, this._uiCapabilities())
  }

  // Exposed so /chat can build the right URL for the active provider.
  chatUrl(id: string): string {
    return chatUrl(id)
  }

  // ---------- ask ----------

  async _waitForSendSlot(agent: boolean): Promise<void> {
    if (!agent) return
    if (!this._lastSentAt) return
    const gap = this.sendIntervalMs() - (Date.now() - this._lastSentAt)
    if (gap <= 0) return
    const report = (leftMs: number) => {
      const secs = Math.max(0, Math.ceil(leftMs / 1000))
      if (this.onSendPause) {
        try {
          this.onSendPause(secs)
        } catch {}
      }
    }
    report(gap)
    this._emitSendState('paused')
    await this._sleepInterruptible(gap, report)
  }

  async _sleepInterruptible(
    ms: number,
    onTick?: (leftMs: number) => void,
  ): Promise<boolean> {
    const step = 100
    let left = ms
    let sinceTick = 0
    while (left > 0) {
      if (this._abort) return true
      if (this._askCancelled) return true
      const chunk = Math.min(step, left)
      await this.page.waitForTimeout(chunk)
      left -= chunk
      if (onTick) {
        sinceTick += chunk
        if (sinceTick >= 1000) {
          sinceTick = 0
          onTick(left)
        }
      }
    }
    return this._abort
  }

  // Cancel an in-flight ask() whose caller already gave up on it (the agent
  // loop's watchdog). Reset at the start of every _askOnce.
  cancelPendingAsk(): void {
    this._askCancelled = true
  }

  async ask(
    prompt: string,
    {
      timeout = this.answerTimeoutMs,
      agent = false,
      attachments = [],
    }: {
      timeout?: number
      agent?: boolean
      attachments?: Array<{ path: string; name: string; mime: string }>
    } = {},
  ): Promise<string> {
    let lastErr: Error | null = null
    let attempt = 0
    let rateLimitRetries = 0
    let serverBusyRetries = 0
    let incompleteRetries = 0
    this._askInFlight++
    try {
      while (attempt < this.askRetries) {
        try {
          const answer = await this._askOnce(prompt, {
            timeout,
            agent,
            attachments,
          })
          if (answer !== '(прервано пользователем)') {
            this._emitSendState('settled')
          }
          return answer
        } catch (e) {
          lastErr = e as Error
          const msg = (e as Error).message || ''
          // The guest daily limit cannot be waited out — fail fast and tell the
          // operator to sign in instead of burning the rate-limit budget.
          if (e instanceof QwenGuestLimitError) {
            throw new Error(this._t('qwen.guest_limit'))
          }
          if (e instanceof QwenAgeGateError) {
            // Not retryable: a resend hits the SAME gate. Fail at once with a
            // clear "sign in" message instead of burning the retry budget.
            throw new Error(this._t('qwen.age_gate_block'))
          }
          if (/rate limit|too frequent/i.test(msg)) {
            if (rateLimitRetries >= this.maxRateLimitRetries) break
            rateLimitRetries++
            this._notice(
              this._t('qwen.rate_limit_wait', {
                min: Math.ceil(this.rateLimitWaitMs / 60000),
                attempt: rateLimitRetries,
                max: this.maxRateLimitRetries,
              }),
            )
            await this._sleepInterruptible(this.rateLimitWaitMs)
            continue
          }
          if (e instanceof QwenServerBusyError || /server busy/i.test(msg)) {
            if (serverBusyRetries >= this.maxServerBusyRetries) break
            serverBusyRetries++
            this._notice(
              this._t('qwen.server_busy_wait', {
                sec: Math.ceil(this.serverBusyWaitMs / 1000),
                attempt: serverBusyRetries,
                max: this.maxServerBusyRetries,
              }),
            )
            await this._sleepInterruptible(this.serverBusyWaitMs)
            continue
          }
          if (e instanceof QwenIncompleteError) {
            if (incompleteRetries >= this.maxIncompleteRetries) break
            incompleteRetries++
            this._notice(
              theme.warn(
                this._t('qwen.incomplete_retry', {
                  attempt: incompleteRetries,
                  max: this.maxIncompleteRetries,
                }),
              ),
            )
            await this._sleepInterruptible(this.incompleteWaitMs)
            continue
          }
          // A LOST page/context ("Target page, context or browser has been
          // closed") is fatal for this attempt but recoverable: relaunch the
          // persistent context and re-run the turn. Qwen's page can crash under
          // memory pressure on a long run, and without this ask() just kept
          // retrying against a dead page and failed every time.
          if (
            /target page, context or browser has been closed|page.*has been closed/i.test(
              msg,
            )
          ) {
            this._notice(theme.warn(this._t('qwen.restart_browser')))
            try {
              await this.restart()
              await this.waitForLogin()
            } catch (re) {
              this._notice(
                theme.warn(
                  this._t('qwen.restart_failed', {
                    error: (re as Error).message,
                  }),
                ),
              )
            }
          }
          this._notice(
            theme.warn(
              this._t('qwen.ask_retry', {
                attempt: attempt + 1,
                max: this.askRetries,
                error: msg,
              }),
            ),
          )
          if (attempt < this.askRetries - 1) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
          }
          attempt++
        }
      }
      throw new Error(
        this._t('qwen.ask_failed', {
          max: this.askRetries,
          error: lastErr?.message || '',
        }),
      )
    } finally {
      this._askInFlight = Math.max(0, this._askInFlight - 1)
      void this._setBusyTitle(false)
    }
  }

  // Attach files/images before typing the text (the upload chip appears above
  // the input). Returns the files that FAILED so the prompt can rewrite their
  // markers. Mirrors DeepSeekBrowser._attachFiles.
  async _attachFiles(
    files: Array<{ path: string; name: string; mime: string }>,
  ): Promise<Array<{ path: string; name: string }>> {
    const { payload: bufPayload, failed } = await readAttachBuffers(
      files,
      (name, error) =>
        this._notice(
          theme.warn(this._t('qwen.attach_read_failed', { name, error })),
        ),
    )
    if (!bufPayload.length) return failed

    // Primary flow (verified live): click the "+" (`.mode-select-open`) to
    // open the mode menu, then "Upload attachment" — that click fires a real
    // filechooser the upload handler listens to. A direct setInputFiles on the
    // hidden input uploads the bytes but does NOT register the chip in the UI
    // state, so it is only the fallback.
    try {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser', { timeout: 5000 }),
        (async () => {
          await this.page
            .locator(ATTACH_MENU_TRIGGER)
            .first()
            .click({ timeout: 3000 })
          await this.page.waitForTimeout(600)
          await this.page
            .getByText(ATTACH_MENU_ITEM_RE)
            .first()
            .click({ timeout: 3000 })
        })(),
      ])
      await chooser.setFiles(bufPayload)
      await this._awaitUploadPreview(
        files.map((f) => f.name),
        5000,
      )
      return failed
    } catch {}

    // Fallback: set the files directly on the hidden <input type=file>.
    for (const sel of ATTACH_SELECTORS) {
      const el = this.page.locator(sel).last()
      try {
        if ((await el.count()) === 0) continue
        await el.setInputFiles(bufPayload, { timeout: 15_000 })
        await this._awaitUploadPreview(
          files.map((f) => f.name),
          3000,
        )
        return failed
      } catch {}
    }

    this._notice(this._t('qwen.attach_no_input'))
    for (const f of files) failed.push({ path: f.path, name: f.name })
    return failed
  }

  // Wait for the upload chip (the file name above the input). Delegates to the
  // shared helper so both providers use the SAME preview policy.
  async _awaitUploadPreview(names: string[], timeoutMs: number): Promise<void> {
    await awaitUploadPreview(this.page, names, timeoutMs)
  }

  async _setInputText(input: Locator, text: string): Promise<void> {
    const tag = await input.evaluate((el: Element) => el.tagName.toLowerCase())
    if (tag === 'textarea' || tag === 'input') {
      try {
        await input.fill(text, { timeout: 5000 })
        return
      } catch {}
    }
    // contenteditable fallback: paste so a big block is inserted in one go.
    await input.click({ timeout: 3000 }).catch(() => {})
    await input
      .evaluate((el: HTMLElement, value: string) => {
        el.focus()
        const dt = new DataTransfer()
        dt.setData('text/plain', value)
        el.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        )
      }, text)
      .catch(async () => {
        await input.fill(text).catch(() => {})
      })
  }

  async _askOnce(
    prompt: string,
    {
      timeout,
      agent,
      attachments = [],
    }: {
      timeout: number
      agent: boolean
      attachments?: Array<{ path: string; name: string; mime: string }>
    },
  ): Promise<string> {
    this._abort = false
    this._askCancelled = false
    if (this._stopped) return '(прервано пользователем)'

    await this._dismissOverlays()
    // The input may briefly be absent right after load ("Model loading…"), so
    // poll for it instead of a single lookup — the first run on a cold page
    // otherwise threw ds.input_missing while the textarea was still mounting.
    // If the page lost the input entirely (a crash during a cancelled send),
    // navigate back to the chat so the next attempt has a live input again
    // instead of failing every retry against a dead DOM.
    await this._awaitInput(10_000)
    let input = await this._findVisible(INPUT_SELECTORS, 3000)
    if (!input) {
      try {
        await this.page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
        await this._dismissOverlays()
        await this._awaitInput(10_000)
        input = await this._findVisible(INPUT_SELECTORS, 3000)
      } catch {}
    }
    if (!input) throw new Error(this._t('qwen.input_missing'))

    const beforeText = await this._readLastAnswerTextCleanDom().catch(() => '')
    await this._waitForSendSlot(agent)
    if (this._abort) return '(прервано пользователем)'
    if (this.onSendStart) {
      try {
        this.onSendStart()
      } catch {}
    }
    this._emitSendState('generating')
    void this._setBusyTitle(true)
    this._netCapture = ''
    this._netCaptureAt = 0
    this._netNoAnswer = false
    this._netRateLimited = false
    this._netGuestLimit = false
    this._netServerBusy = false
    this._netBody = ''

    await this._applyToggles()
    if (attachments.length) {
      const failed = await this._attachFiles(attachments)
      prompt = rewriteFailedAttachments(prompt, failed)
    }
    await this._setInputText(input, prompt)

    // Send. The input may hold the text WITHOUT the message having been sent
    // (a real complaint: "text is in the Qwen chat but the send button was not
    // pressed"). So we do not merely click once — we click AND verify, retrying
    // through a deadline until the input actually clears (Qwen clears the
    // textarea the moment it accepts the message). Verification is the ONLY
    // reliable signal: a disabled button, a menu that stole focus, or a click
    // that landed on an overlay all leave the text in place.
    //
    // We try, in order each round: (1) a click on a VISIBLE, ENABLED send
    // button, (2) Enter as a fallback. With attachments the upload can keep the
    // button disabled for a while, so the window is longer in that case.
    const sendDeadline =
      Date.now() + (attachments.length ? 30_000 : this.sendButtonWaitMs)
    const preSendSignal = await this._chatSignal()
    let sent = false
    while (!sent && Date.now() < sendDeadline) {
      // The age-confirmation gate can POP UP on the FIRST send (it is not
      // present at page load). While it is on screen it swallows the click on
      // the send button, so the message never goes out. Dismiss it BEFORE each
      // send attempt; a no-op once it is gone.
      await this._dismissOverlays()
      // (1) the send button, if present/enabled/visible. We remember whether a
      // click was actually issued: pressing Enter in the SAME round could send
      // the message a SECOND time if the click already worked but the input
      // had not cleared yet.
      let clicked = false
      for (const sel of SEND_SELECTORS) {
        const btn = this.page.locator(sel).last()
        try {
          if ((await btn.count()) === 0) continue
          if (!(await btn.isVisible().catch(() => false))) continue
          const enabled = await btn
            .evaluate(isElementEnabledInDom)
            .catch(() => true)
          if (!enabled) continue
          await btn.click({ timeout: 1500 })
          clicked = true
          break
        } catch {}
      }
      // (2) Enter fallback — ONLY when no send button was clicked this round
      // (a build that sends solely on Enter, or a missing button). This is
      // what avoids a double send.
      if (!clicked) {
        await this.page.keyboard.press('Enter').catch(() => {})
      }

      // VERIFY: the input must clear. Give the app a moment to react. A send
      // ALSO counts as successful when the page started generating (the chat
      // signal grew / a Stop button appeared) even if the textarea did not
      // clear immediately — some builds keep the last message in the box.
      await this.page.waitForTimeout(300)
      const stillThere = await input
        .evaluate(readInputTrimmedTextInDom)
        .catch(() => '')
      if (!stillThere) {
        sent = true
        break
      }
      const sig = await this._chatSignal().catch(() => preSendSignal)
      const stopVisible = await this._stopButtonVisible().catch(() => false)
      if (
        stopVisible ||
        sig.nodes > preSendSignal.nodes ||
        sig.lastLen > preSendSignal.lastLen
      ) {
        sent = true
        break
      }
      await this.page.waitForTimeout(150)
    }
    this._lastSentAt = Date.now()
    if (!sent) {
      // The text is still in the input after the whole deadline: the message
      // was NOT sent. A common cause is the age-confirmation gate that pops up
      // for a GUEST and (verified live) does not always close programmatically
      // — it swallows the click on the send button. Report that explicitly so
      // the operator knows to sign in instead of seeing a generic error.
      const gate = await this.page
        .locator(AGE_GATE_MODAL)
        .count()
        .catch(() => 0)
      if (gate > 0) {
        throw new QwenAgeGateError('age-confirmation modal blocks the send')
      }
      // Throw so ask() retries the send instead of waiting out the full answer
      // timeout for a turn that never started.
      throw new Error(this._t('qwen.send_button_missing'))
    }

    // Wait for the answer to start, then for it to settle.
    const startDeadline = Date.now() + this.startWaitMs
    const startSignal = await this._chatSignal()
    let started = false
    while (Date.now() < startDeadline) {
      if (this._abort || this._askCancelled) return '(прервано пользователем)'
      const pageText = await this._readPageText()
      if (isRateLimitText(pageText)) {
        throw new QwenRateLimitError(pageText.slice(0, 300))
      }
      if (this._netGuestLimit && this._netCaptureAt >= this._lastSentAt) {
        throw new QwenGuestLimitError(this._netBody.slice(0, 200))
      }
      if (this._netRateLimited && this._netCaptureAt >= this._lastSentAt) {
        throw new QwenRateLimitError(this._netBody.slice(0, 300))
      }
      if (this._netServerBusy && this._netCaptureAt >= this._lastSentAt) {
        throw new QwenServerBusyError(this._netBody.slice(0, 300))
      }
      const sig = await this._chatSignal()
      if (sig.nodes > startSignal.nodes || sig.lastLen > startSignal.lastLen) {
        started = true
        break
      }
      await this.page.waitForTimeout(200)
    }
    if (!started && !this._netCapture) {
      // The answer may have arrived over the network without changing the DOM
      // signal (e.g. a very short reply rendered late). Give the capture a
      // chance before declaring failure.
      await this.page.waitForTimeout(1500)
    }

    // Finish loop: wait until the answer text stops changing for
    // `stabilityChecks` ticks, or the deadline passes.
    const deadline = Date.now() + timeout
    let last = ''
    let stable = 0
    while (Date.now() < deadline) {
      if (this._abort || this._askCancelled) return '(прервано пользователем)'
      const pageText = await this._readPageText()
      if (isRateLimitText(pageText)) {
        throw new QwenRateLimitError(pageText.slice(0, 300))
      }
      if (this._netGuestLimit && this._netCaptureAt >= this._lastSentAt) {
        throw new QwenGuestLimitError(this._netBody.slice(0, 200))
      }
      if (this._netRateLimited && this._netCaptureAt >= this._lastSentAt) {
        throw new QwenRateLimitError(this._netBody.slice(0, 300))
      }
      if (this._netServerBusy && this._netCaptureAt >= this._lastSentAt) {
        throw new QwenServerBusyError(this._netBody.slice(0, 300))
      }
      if (this._netNoAnswer && this._netCaptureAt >= this._lastSentAt) {
        throw new QwenIncompleteError('finished without answer')
      }
      const cur = await this._readLastAnswerTextCleanDom().catch(() => '')
      const net = this._netCapture
      if (net && net !== last) {
        last = net
        stable = 0
      } else if (cur && cur !== beforeText && cur !== last) {
        last = cur
        stable = 0
      } else {
        stable++
      }
      if (stable >= this.stabilityChecks - 1) {
        const answer = this._netCapture || cur
        if (answer && answer !== beforeText) return answer
        // No new answer yet — keep waiting a bit longer.
      }
      await this.page.waitForTimeout(this.stabilityDelayMs)
    }
    const answer = this._netCapture || last
    if (answer && answer !== beforeText) return answer
    throw new Error(this._t('qwen.send_no_new_answer'))
  }
}

// Qwen-specific error classes so ask() can branch on the retryable families.
class QwenRateLimitError extends Error {
  constructor(detail: string) {
    super('rate limit: ' + detail)
    this.name = 'QwenRateLimitError'
  }
}
// The guest daily limit — NOT retryable (resets tomorrow), so ask() fails
// immediately with a message telling the operator to sign in.
class QwenGuestLimitError extends Error {
  constructor(detail: string) {
    super('guest limit: ' + detail)
    this.name = 'QwenGuestLimitError'
  }
}
// The guest age-confirmation gate swallowed the send. NOT retryable: a resend
// hits the same gate, so ask() fails at once instead of burning its retries.
class QwenAgeGateError extends Error {
  constructor(detail: string) {
    super('age gate: ' + detail)
    this.name = 'QwenAgeGateError'
  }
}
class QwenIncompleteError extends Error {
  constructor(detail: string) {
    super('generation incomplete: ' + detail)
    this.name = 'QwenIncompleteError'
  }
}
class QwenServerBusyError extends Error {
  constructor(detail: string) {
    super('server busy: ' + detail)
    this.name = 'QwenServerBusyError'
  }
}
