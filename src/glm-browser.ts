// GLM (chat.z.ai) provider — the third chat backend zames can drive.
//
// WHY a separate class (the same reason QwenBrowser exists): the backends
// differ in EVERY layer we touch — selectors, the send flow, the SSE format and
// the chat-id scheme. The shared surface is the ChatProvider interface
// (types.ts); the agent loop only needs BrowserLike and never sees either
// concrete class.
//
// Verified against a LIVE signed-in session (headless + headed Chromium):
//   input  -> textarea#chat-input
//   send   -> button#send-message-button (POST /api/v1/chats/new, then
//             POST /api/v2/chat/completions?... SSE)
//   answer -> SSE chat:completion chunks with phase === 'answer'
//   model  -> button#model-selector-<id>-button
// A FIRST message from a fresh profile is gated by an Aliyun slider captcha,
// which a headless browser cannot pass — hence the browser-based login
// (src/browser-login.ts) and the explicit captcha error below.

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'
import type { BrowserContext, Locator, Page } from 'playwright'
import { translate, DEFAULT_LOCALE } from './i18n.js'
import type { Locale } from './i18n.js'
import { rewriteFailedAttachments } from './commands.js'
import { recoverFromContextLimit } from './context-limit.js'
import { awaitUploadPreview, readAttachBuffers } from './attach-flow.js'
import { theme } from './theme.js'
import type { ChatInfo, ChatMessage } from './types.js'
import {
  scrapeGlmChatList,
  scrapeGlmChatMessages,
  parseGlmChatList,
  parseGlmHistory,
} from './glm-chats.js'
import {
  cleanAnswer,
  headlessEngineKey,
  readCachedHeadlessUA,
  writeCachedHeadlessUA,
  sanitizeHeadlessUA,
  cleanSingletonFiles,
  profileLooksLocked,
  nukeProfile,
  writeAuthMarker,
} from './browser-pure.js'
import {
  readLastAnswerInDom,
  readPageToastsInDom,
  readUserAgentInDom,
  readInputTrimmedTextInDom,
  isElementEnabledInDom,
  setBusyTitleInDom,
  chatSignalInDom,
} from './browser-dom.js'
import {
  probeUiHealth,
  type UiCapabilitySpec,
  type UiHealthResult,
  type UiProbePage,
} from './ui-health.js'
import {
  CHAT_URL,
  LOGIN_URL,
  CHAT_ID_RE,
  chatUrl,
  INPUT_SELECTORS,
  UPLOAD_BUTTON_SELECTOR,
  SEND_SELECTORS,
  STOP_SELECTORS,
  STOP_NAME_RE,
  NEW_CHAT_SELECTOR,
  MODELS_URL,
  MODEL_TRIGGER_SELECTOR,
  modelIdFromTriggerId,
  CHAT_LIST_URL,
  chatHistoryUrl,
  AUTH_URL,
  ANSWER_URL_RE,
  ANSWER_SELECTORS,
  THINK_CLASS_RE,
  MESSAGE_CONTAINER_SELECTORS,
  USER_CLASS_RE,
  CHAT_SIGNAL_NODES_SELECTOR,
  MARKDOWN_SELECTOR,
} from './glm-ui.js'
import {
  extractAnswer,
  extractTokenUsage,
  isFinishedWithoutAnswer,
  isRateLimitText,
  isQuotaExhaustedText,
  isServerBusyText,
  isGuestLimitText,
  isContextLimitText,
  isCaptchaText,
  extractChatId,
} from './glm-net-capture.js'
import { SendRuntime } from './send-runtime.js'
import {
  readGlmBodyFeatures,
  unsafeGlmModes,
  glmFlagsMismatch,
} from './glm-flags.js'
import {
  interactiveBrowserLogin,
  loginIsInteractive,
  canShowWindow,
  type ProbeResult,
} from './browser-login.js'

export const GLM_USER_DATA_DIR = path.join(
  os.homedir(),
  '.zames',
  'glm-profile',
)

const MAX_NET_BODY = 64 * 1024
function capNetBody(body: string): string {
  if (body.length <= MAX_NET_BODY) return body
  const head = MAX_NET_BODY - 1024
  return body.slice(0, head) + '\n...[truncated]...\n' + body.slice(-1024)
}

export interface GlmBrowserOptions {
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
  /** Compaction attempts after an exhausted context before ask() gives up. */
  maxContextLimitRetries?: number
  /** Compact the exhausted chat into a fresh one; true = resend is OK. */
  onContextLimit?: (() => Promise<boolean>) | null
  startWaitMs?: number
  sendButtonWaitMs?: number
  model?: string
  deepThinking?: boolean
  webSearch?: boolean
  auth?: { username?: string; password?: string; saveSession?: boolean }
  locale?: Locale
  onAuthSave?: (username: string, password: string) => void
  onLoginPrompt?: (info: {
    savedUsername: string
    hasSavedPassword?: boolean
    step?: 'email' | 'code'
  }) => Promise<{ username: string; password: string } | null | string>
  /**
   * Neutralise z.ai's OWN agent runtime by rewriting the completion request
   * (`preview_mode:false`, drop the `general_agent` flag) before it leaves the
   * page. Without this the site intercepts tool calls and runs them in ITS
   * sandbox (`/home/z/my-project`), so zames' tools never execute. Measured:
   * with the rewrite ON the model emits the calls to us and does NOT pretend
   * to have run them.
   */
  disableAgentRuntime?: boolean
  /** 'low' (default) | 'high' | 'max' — cuts the per-turn deliberation. */
  reasoningEffort?: string
  /** Write a telemetry line per send (browser.sendTelemetry). */
  sendTelemetry?: boolean
  /** `~/.zames/logs` (the telemetry directory). */
  logsDir?: string
  /** Login window timeout (ms). 0/undefined -> browser.loginTimeoutMs. */
  loginTimeoutMs?: number
  userAgent?: string
}

export class GlmBrowser {
  providerName = 'glm'
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
  // Ask() budget for the context-limit recovery (a compaction, not a resend).
  maxContextLimitRetries: number
  onContextLimit: (() => Promise<boolean>) | null
  startWaitMs: number
  sendButtonWaitMs: number
  model: string
  deepThinking: boolean
  webSearch: boolean
  auth: { username: string; password: string; saveSession: boolean }
  locale: Locale
  onAuthSave: ((username: string, password: string) => void) | null
  onLoginPrompt: GlmBrowserOptions['onLoginPrompt'] | null
  loginTimeoutMs: number
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
  _netGuestLimit: boolean
  _netServerBusy: boolean
  // True when the chat context window is exhausted: it refuses every
  // further send, so ask() must compact into a fresh chat, not retry here.
  _netContextLimit: boolean
  _netCaptcha: boolean
  _netChatId: string | null
  _lastTokenUsage: number | null
  _toggles: { deepThinking: boolean; webSearch: boolean }
  _apiAuth: string
  _lastHistoryError: string
  _netBody: string
  _netHookInstalled: boolean
  _netHookPage: unknown
  /** The features of the LAST completion request the page sent. */
  _lastBodyFeatures: ReturnType<typeof readGlmBodyFeatures> | null
  _windowClosed: boolean
  /** Cookies captured at close time when a session cookie has no expiry. */
  _carryCookies: Array<Record<string, unknown>> | null
  onSendStart: (() => void) | null
  onSendPause: ((seconds: number) => void) | null
  onSendState: ((state: 'generating' | 'paused' | 'settled') => void) | null
  onNotice: ((text: string) => void) | null
  userAgent: string
  /** Telemetry + adaptive throttle state (see src/send-runtime.ts). */
  sendRuntime!: SendRuntime
  /** Rewrite the request to disable z.ai's own agent runtime (see options). */
  disableAgentRuntime: boolean
  /**
   * `reasoning_effort` sent with each request ('low' | 'high' | 'max').
   * z.ai defaults to 'max', which makes EVERY turn deliberate at length —
   * a measured 8-14 s for the system-prompt alone and minutes for a task.
   * 'low' keeps thinking on (it cannot be disabled for these models) but
   * removes most of the wait. Empty = leave the site's default.
   */
  reasoningEffort: string

  constructor({
    headless = false,
    debug = false,
    channel = null,
    answerTimeoutMs = 300000,
    askRetries = 3,
    stabilityChecks = 2,
    stabilityDelayMs = 400,
    minSendIntervalMs = 0,
    rateLimitWaitMs = 300000,
    maxRateLimitRetries = 6,
    maxServerBusyRetries = 5,
    serverBusyWaitMs = 3000,
    maxIncompleteRetries = 4,
    incompleteWaitMs = 2000,
    maxContextLimitRetries = 1,
    onContextLimit,
    startWaitMs = 30000,
    sendButtonWaitMs = 8000,
    model = '',
    deepThinking = false,
    webSearch = false,
    auth,
    locale,
    onAuthSave,
    onLoginPrompt,
    disableAgentRuntime = true,
    reasoningEffort = 'low',
    sendTelemetry = true,
    logsDir,
    loginTimeoutMs = 600000,
    userAgent,
  }: GlmBrowserOptions = {}) {
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
    this.maxContextLimitRetries = maxContextLimitRetries
    this.onContextLimit = onContextLimit || null
    this.startWaitMs = startWaitMs
    this.sendButtonWaitMs = sendButtonWaitMs
    this.model = model
    // The flagship models cannot skip thinking (skip_think=false in the
    // catalogue), so the provider always reports it ON: the 🧠 icon then
    // tells the truth and /thinking cannot pretend to disable it.
    this.deepThinking = true
    this.webSearch = webSearch
    this.auth = {
      username: (auth?.username || '').trim(),
      password: auth?.password || '',
      saveSession: auth?.saveSession !== false,
    }
    this.locale = locale || DEFAULT_LOCALE
    this.onAuthSave = onAuthSave || null
    this.onLoginPrompt = onLoginPrompt || null
    this.loginTimeoutMs = loginTimeoutMs
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
    this._netContextLimit = false
    this._netCaptcha = false
    this._netChatId = null
    this._lastTokenUsage = null
    this._toggles = { deepThinking, webSearch }
    this._apiAuth = ''
    this._lastHistoryError = ''
    this._netBody = ''
    this._netHookInstalled = false
    this._netHookPage = null
    this._lastBodyFeatures = null
    this._windowClosed = false
    this._carryCookies = null
    this.onSendStart = null
    this.onSendPause = null
    this.onSendState = null
    this.onNotice = null
    this.userAgent = userAgent || ''
    // The adaptive throttle is ON for GLM: its own rate limit was not measured
    // (a guest is gated by a captcha first), so a fixed 0 pause plus a LEARNED
    // back-off beats a guess. The telemetry is what the operator analyses
    // later to pick the real values.
    this.disableAgentRuntime = disableAgentRuntime
    this.reasoningEffort = reasoningEffort
    this.sendRuntime = new SendRuntime({
      provider: 'glm',
      baseMs: minSendIntervalMs,
      rateLimitWaitMs,
      adaptive: true,
      telemetry: sendTelemetry,
      logsDir: logsDir || path.join(os.homedir(), '.zames', 'logs'),
    })
  }

  _t(key: string, params?: Record<string, string | number>): string {
    return translate(this.locale)(key, { provider: 'GLM', ...params })
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
    return this.sendRuntime.intervalMs()
  }

  // ---------- lifecycle ----------

  async launch(): Promise<void> {
    if (await profileLooksLocked(GLM_USER_DATA_DIR)) {
      if (this.debug) console.error('glm profile: removing Singleton files')
      await cleanSingletonFiles(GLM_USER_DATA_DIR)
    }
    if (this.headless && !this.userAgent) {
      const cached = await readCachedHeadlessUA(headlessEngineKey())
      if (cached) this.userAgent = cached
    }
    await this._launchOnce()
    await this._fixHeadlessUserAgent()
  }

  async _fixHeadlessUserAgent(): Promise<void> {
    if (!this.headless) return
    if (this.userAgent) return
    try {
      const ua: string = await this.page.evaluate(readUserAgentInDom)
      const fixed = sanitizeHeadlessUA(ua)
      if (fixed === ua) return
      this.userAgent = fixed
      void writeCachedHeadlessUA(headlessEngineKey(), fixed)
      if (this.debug)
        console.error('glm profile: headless UA -> relaunching plain Chrome UA')
      await this.context.close().catch(() => {})
      await this._launchOnce()
    } catch (e) {
      if (this.debug)
        console.error('glm profile: UA fix failed:', (e as Error).message)
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
        GLM_USER_DATA_DIR,
        options,
      )
    } catch (e) {
      if (/profile.*in use|has been closed/i.test((e as Error).message)) {
        await cleanSingletonFiles(GLM_USER_DATA_DIR)
        try {
          this.context = await chromium.launchPersistentContext(
            GLM_USER_DATA_DIR,
            options,
          )
        } catch {
          await nukeProfile(GLM_USER_DATA_DIR)
          this.context = await chromium.launchPersistentContext(
            GLM_USER_DATA_DIR,
            options,
          )
        }
      } else {
        throw e
      }
    }
    // Session cookies that have NO expiry are dropped when the context closes;
    // re-apply them BEFORE the first goto, or the SPA answers 401 and may wipe
    // its own token.
    if (this._carryCookies && this._carryCookies.length) {
      await this.context.addCookies(this._carryCookies as never).catch(() => {})
    }

    this.page = this.context.pages()[0] || (await this.context.newPage())
    this._windowClosed = false
    this.page.on('close', () => {
      this._windowClosed = true
    })
    this.context.on('close', () => {
      this._windowClosed = true
    })
    this._installNetHook()
    await this.page
      .goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
      .catch(() => {})
  }

  async restart(): Promise<void> {
    try {
      if (this.context) await this.context.close()
    } catch {}
    await this._launchOnce()
    await this._fixHeadlessUserAgent()
  }

  /**
   * Relaunch the SAME persistent profile in another headless mode — the
   * dedicated path the login flow needs (NOT _launchOnce: it must not clean
   * Singleton files or nuke the profile, and it must wait for the previous
   * context to release its lock).
   */
  async relaunchSafe(headless: boolean): Promise<void> {
    // Session cookies (no `expires`) live only in memory: grab them before the
    // context closes so the new one starts signed in.
    try {
      const cookies = await this.context.cookies()
      const session = cookies.filter((c) => c.expires === -1 || c.expires < 0)
      if (session.length) {
        this._carryCookies = session.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite,
        }))
      }
    } catch {}
    try {
      if (this.context) await this.context.close()
    } catch {}
    await this._waitProfileUnlocked(15_000)
    this.headless = headless
    const options: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless,
      slowMo: 10,
      args: ['--disable-blink-features=AutomationControlled'],
    }
    if (this.channel) options.channel = this.channel
    if (this.userAgent) options.userAgent = this.userAgent
    try {
      this.context = await chromium.launchPersistentContext(
        GLM_USER_DATA_DIR,
        options,
      )
    } catch (e) {
      throw new Error(
        'glm: the browser profile is busy (' + (e as Error).message + ')',
      )
    }
    if (this._carryCookies && this._carryCookies.length) {
      await this.context.addCookies(this._carryCookies as never).catch(() => {})
    }
    this.page = this.context.pages()[0] || (await this.context.newPage())
    this._windowClosed = false
    this.page.on('close', () => {
      this._windowClosed = true
    })
    this.context.on('close', () => {
      this._windowClosed = true
    })
    this._netHookInstalled = false
    this._netHookPage = null
    this._installNetHook()
  }

  /** Poll until the profile's SingletonLock is gone (a timeout is an error). */
  async _waitProfileUnlocked(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!(await profileLooksLocked(GLM_USER_DATA_DIR))) return
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('glm: the browser profile is still locked')
  }

  // ---------- login ----------

  /**
   * A FAST login probe with NO long waits (the old isLoggedIn polled up to
   * 20 s, which is a false "logged out" on a slow network). The signal is the
   * API's own answer — a bearer token in localStorage plus GET /api/v1/auths/
   * — and the DOM is only a fallback, because a GUEST also sees the input.
   */
  async probeLogin(): Promise<ProbeResult> {
    if (!this.page) return 'unknown'
    try {
      const r = await this.page.evaluate(async (authUrl: string) => {
        const hasToken = (() => {
          try {
            return !!localStorage.getItem('token')
          } catch {
            return false
          }
        })()
        let role: string | null = null
        let api = false
        try {
          const res = await fetch(authUrl, {
            credentials: 'include',
            headers: { accept: 'application/json' },
          })
          api = res.ok
          const j = await res.json()
          role = typeof j?.role === 'string' ? j.role : null
        } catch {}
        const bodyText = document.body ? document.body.innerText : ''
        const captcha = /security verification|drag the slider/i.test(bodyText)
        const signInVisible = /\bsign in\b/i.test(bodyText) && !hasToken
        return { hasToken, role, api, captcha, signInVisible }
      }, AUTH_URL)
      if (r.captcha) return 'challenge'
      const role = String(r.role || '').toLowerCase()
      if (role === 'user' || role === 'admin') return 'in'
      if (role === 'guest') return r.hasToken ? 'out' : 'out'
      if (r.hasToken && r.api) return 'in'
      if (r.signInVisible) return 'out'
      return r.api ? 'out' : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /** Compatibility wrapper: is the session active right now? */
  async isLoggedIn(): Promise<boolean> {
    return (await this.probeLogin()) === 'in'
  }

  async _openLoginPage(): Promise<void> {
    try {
      if (!/\/auth(\b|$|\?)/i.test(this.page.url())) {
        await this.page
          .goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
          .catch(() => {})
      }
      await this.page.waitForTimeout(1500)
      // The email form lives behind "Continue with Email".
      await this.page
        .getByRole('button', { name: /continue\s*with\s*email/i })
        .first()
        .click({ timeout: 3000 })
        .catch(() => {})
      await this.page.waitForTimeout(1500)
    } catch {}
  }

  /** Prefill the SAVED login (never the password — that is filled on submit). */
  async _prefillLogin(): Promise<void> {
    try {
      const saved = this.auth.username
      if (!saved) return
      const email = this.page.locator('input[type="email"]').first()
      if ((await email.count().catch(() => 0)) === 0) return
      if (await email.isVisible().catch(() => false)) {
        await email.fill(saved, { timeout: 2000 }).catch(() => {})
      }
    } catch {}
  }

  /**
   * Best-effort password login with the SAVED credentials. z.ai's form is
   * email + password on /auth; a captcha may still block the submit, in which
   * case the caller falls through to the browser window.
   */
  async _autoLogin(): Promise<boolean> {
    if (!this.auth.username || !this.auth.password) return false
    try {
      await this._openLoginPage()
      const email = this.page.locator('input[type="email"]').first()
      await email.waitFor({ state: 'visible', timeout: 8000 })
      await email.fill(this.auth.username)
      const pwd = this.page.locator('input[type="password"]').first()
      if ((await pwd.count().catch(() => 0)) === 0) return false
      await pwd.fill(this.auth.password)
      await this._clickSignIn()
      const ok = await this._waitLoggedIn(20000)
      if (ok) {
        this._notice(this._t('glm.login_ok'))
        // Remember the credentials that WORKED, so the next launch signs in
        // silently without a window. The auto-login is the one path that used
        // to skip this, which is why a successful auto sign-in left the
        // config without the password and the NEXT cold start needed a window.
        try {
          this.onAuthSave?.(this.auth.username, this.auth.password)
        } catch {}
      }
      return ok
    } catch (e) {
      if (this.debug)
        console.error('glm auto-login failed:', (e as Error).message)
      return false
    }
  }

  async _clickSignIn(): Promise<void> {
    const btn = this.page
      .getByRole('button', { name: /^\s*sign in\s*$/i })
      .first()
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 4000 }).catch(() => {})
    } else {
      await this.page.keyboard.press('Enter').catch(() => {})
    }
    await this.page.waitForTimeout(1500)
  }

  async _waitLoggedIn(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if ((await this.probeLogin()) === 'in') return true
      await this.page.waitForTimeout(800)
    }
    return false
  }

  /**
   * Hook the login form so the credentials the OPERATOR types in the window
   * reach Node (and then the config) — that is what makes the NEXT launch a
   * silent auto-login. Registered through page.exposeFunction, so the page
   * calls back into Node on submit.
   */
  async _captureLoginCredentials(): Promise<void> {
    try {
      await this.page.exposeFunction(
        '__zamesGlmCreds',
        (email: string, password: string) => {
          const u = String(email || '').trim()
          const p = String(password || '')
          if (!u) return
          this.auth.username = u
          if (p) this.auth.password = p
          try {
            this.onAuthSave?.(u, p)
          } catch {}
        },
      )
      await this.page.evaluate(() => {
        const w = window as unknown as { __zamesGlmHooked?: boolean }
        if (w.__zamesGlmHooked) return
        w.__zamesGlmHooked = true
        document.addEventListener(
          'submit',
          (ev) => {
            try {
              const form = ev.target as HTMLElement | null
              if (!form) return
              const email = form.querySelector(
                'input[type="email"]',
              ) as HTMLInputElement | null
              const pwd = form.querySelector(
                'input[type="password"]',
              ) as HTMLInputElement | null
              const fn = (
                window as unknown as {
                  __zamesGlmCreds?: (e: string, p: string) => void
                }
              ).__zamesGlmCreds
              if (email && fn) fn(email.value || '', pwd ? pwd.value || '' : '')
            } catch {}
          },
          true,
        )
      })
    } catch {}
  }

  async _persistSessionIfNeeded(): Promise<void> {
    if (!this.auth.saveSession) return
    if ((await this.probeLogin()) !== 'in') return
    await writeAuthMarker('glm')
  }

  /**
   * Sign in, in this order: an existing session, the saved credentials, the
   * browser window (a human solves the captcha there), then back to headless.
   * The decision sequence is the SHARED interactiveBrowserLogin.
   */
  async waitForLogin(): Promise<void> {
    const interactive = loginIsInteractive({
      isTTY: !!process.stdin.isTTY,
      oneShot: false,
      scheduled: false,
      env: process.env,
    })
    const showWindow = canShowWindow(
      process.env as Record<string, string | undefined>,
      process.platform,
    )
    await interactiveBrowserLogin({
      provider: 'GLM',
      probeLogin: () => this.probeLogin(),
      autoLogin: () => this._autoLogin(),
      relaunch: (h) => this.relaunchSafe(h),
      openLoginPage: () => this._openLoginPage(),
      gotoChat: async () => {
        await this.page
          .goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
          .catch(() => {})
      },
      prefill: () => this._prefillLogin(),
      captureCredentials: () => this._captureLoginCredentials(),
      persistSession: () => this._persistSessionIfNeeded(),
      notice: (key) => this._notice(this._t(key)),
      isAborted: () => this._abort,
      windowClosed: () => this._windowClosed,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      interactive,
      stayHeaded: !this.headless,
      guestAllowed: false,
      canShowWindow: showWindow,
      tuiLogin: this.onLoginPrompt
        ? async () => {
            const res = await this.onLoginPrompt?.({
              savedUsername: this.auth.username,
              hasSavedPassword: !!this.auth.password,
            })
            if (!res || typeof res !== 'object') return false
            this.auth.username = res.username.trim()
            this.auth.password = res.password
            const ok = await this._autoLogin()
            if (ok) this.onAuthSave?.(this.auth.username, this.auth.password)
            return ok
          }
        : undefined,
      timeoutMs: this.loginTimeoutMs,
    })
    await this._persistSessionIfNeeded().catch(() => {})
  }

  async close(): Promise<void> {
    // A session cookie (expires = -1) is dropped when the context closes, so a
    // sign-in would not survive the process. Re-add it as a PERSISTENT cookie
    // before closing: the token then lives in the profile and the next launch
    // is signed in without a window.
    try {
      if (this.context) {
        const cookies = await this.context.cookies()
        const session = cookies.filter((c) => c.expires === -1 || c.expires < 0)
        if (session.length) {
          const keepUntil = Math.floor((Date.now() + 15552000000) / 1000)
          await this.context.addCookies(
            session.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              httpOnly: c.httpOnly,
              secure: c.secure,
              sameSite: c.sameSite,
              expires: keepUntil,
            })) as never,
          )
        }
      }
    } catch {}
    try {
      if (this.context) await this.context.close()
    } catch {}
  }

  /**
   * Rewrite the completion REQUEST so z.ai's own agent runtime stays off.
   * The site builds the body with `features.preview_mode:true` and
   * `flags:['general_agent']`; with them the model's tool calls are executed
   * INSIDE z.ai's sandbox and never reach zames. Playwright can rewrite the
   * post body before it is sent, which is the only lever we have (no UI
   * control exists for those flags).
   */
  async _installRuntimeRewrite(): Promise<void> {
    if (!this.disableAgentRuntime) return
    try {
      // A PREDICATE (not an anchored regex): the live URL carries
      // ?timestamp=…&requestId=…, which an end-anchored pattern misses.
      await this.page.route(
        (url) => url.pathname.includes('/api/v2/chat/completions'),
        async (route) => {
          try {
            const body = JSON.parse(route.request().postData() || '{}')
            const f = body.features
            if (f && typeof f === 'object') {
              f.preview_mode = false
              if (Array.isArray(f.flags)) {
                f.flags = f.flags.filter((x: unknown) => x !== 'general_agent')
              }
              // z.ai starts its OWN web search even when the request says
              // `web_search:false` (measured: 260+ search iterations on a plain
              // file task). Each call burns account credits and minutes, and the
              // busy UI then refuses the next send ("send button not found").
              // The model does not need the web to read or edit local files, so
              // the flags are forced off on the way out.
              f.web_search = false
              f.auto_web_search = false
              f.vlm_web_search_enable = false
              // `reasoning_effort: 'max'` makes every turn THINK as long as it
              // can: a 19 KB system-prompt took 8-14 s, and a real task 3+ min.
              // The catalogue offers low/high/max; `low` keeps thinking on
              // (it cannot be disabled) but cuts the deliberation time a lot.
              // Configurable, because a hard debugging task may want `max`.
              // The field lives at features.reasoning_effort, but the body
              // ALSO carries a top-level `reasoning_effort` on some builds -
              // set both so the site cannot fall back to its 'max' default.
              if (this.reasoningEffort) {
                f.reasoning_effort = this.reasoningEffort
                if (typeof body.reasoning_effort === 'string') {
                  body.reasoning_effort = this.reasoningEffort
                }
              }
            }
            // The body that ACTUALLY goes out - the only honest source for
            // _verifyModes (the `request` event sees the pre-rewrite body).
            this._lastBodyFeatures = readGlmBodyFeatures(body)
            if (this.debug) {
              console.error(
                'glm route: web_search=' +
                  String(f && (f as Record<string, unknown>).web_search) +
                  ' auto=' +
                  String(f && (f as Record<string, unknown>).auto_web_search) +
                  ' effort=' +
                  String(f && (f as Record<string, unknown>).reasoning_effort) +
                  ' flags=' +
                  JSON.stringify(
                    (f && (f as Record<string, unknown>).flags) || [],
                  ),
              )
            }
            await route.continue({ postData: JSON.stringify(body) })
          } catch {
            await route.continue()
          }
        },
      )
    } catch {}
  }

  // ---------- network capture ----------

  _installNetHook(): void {
    const pg = this.page
    if (!pg) return
    if (this._netHookInstalled && this._netHookPage === pg) return
    this._netHookInstalled = true
    this._netHookPage = pg
    pg.on('response', (resp) => {
      void this._onResponse(resp).catch(() => {})
    })
    // Neutralise z.ai's own agent runtime BEFORE the first send.
    void this._installRuntimeRewrite()
    pg.on('request', (req) => {
      try {
        const url = req.url()
        if (!url.includes('chat.z.ai/api/')) return
        const h = req.headers()
        if (h['authorization']) this._apiAuth = h['authorization']
        // Remember what the site actually sent: the mode flags are decided
        // by ITS UI state, so this is the ground truth for _verifyModes.
        // (The features are recorded by _installRuntimeRewrite's route handler:
        // the `request` event still carries the ORIGINAL body.)
      } catch {}
    })
  }

  async _onResponse(resp: import('playwright').Response): Promise<void> {
    try {
      const url = resp.url()
      if (!/chat\.z\.ai/.test(url)) return
      if (/\.(js|css|png|jpg|jpeg|svg|woff2?|ico|map|webp)(\?|$)/i.test(url))
        return
      const ct = (resp.headers()['content-type'] || '').toLowerCase()
      const interesting =
        ct.includes('event-stream') ||
        ct.includes('json') ||
        ct.includes('text/plain') ||
        ct.includes('text/html')
      if (!interesting) return
      const body = await resp.text().catch(() => '')
      if (!body) return

      const usage = extractTokenUsage(body)
      if (usage !== null) this._lastTokenUsage = usage

      if (isCaptchaText(body)) {
        this._netCaptcha = true
        this._netBody = capNetBody(body)
        this._netCaptureAt = Date.now()
      }
      if (isGuestLimitText(body)) {
        this._netGuestLimit = true
        this._netBody = capNetBody(body)
        this._netCaptureAt = Date.now()
      }

      // Track the current chat id as soon as the API reveals it (the URL may
      // lag behind a fresh chat).
      if (/\/api\/v1\/chats(\/new)?(\?|$)/i.test(url)) {
        const cid = extractChatId(body)
        if (cid) this._netChatId = cid
      }

      if (!ANSWER_URL_RE.test(url)) return

      const extracted = extractAnswer(body)
      if (extracted) {
        this._netCapture = extracted
        this._netNoAnswer = false
        this._netCaptureAt = Date.now()
      }
      if (this._askInFlight === 0) {
        this._lastSentAt = Date.now()
      }
      this._netBody = capNetBody(body)
      const cid = extractChatId(body)
      if (cid) this._netChatId = cid
      if (!extracted) {
        if (isFinishedWithoutAnswer(body)) {
          this._netNoAnswer = true
          this._netCapture = ''
        }
        if (isRateLimitText(body)) {
          this._netRateLimited = true
          this._netCapture = ''
        }
        if (isServerBusyText(body)) {
          this._netServerBusy = true
        }
        if (isContextLimitText(body)) {
          this._netContextLimit = true
          this._netCapture = ''
        }
        this._netCaptureAt = Date.now()
      }
    } catch {}
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
        const list = parseGlmChatList(res.data).slice(0, limit)
        if (list.length) return list
      } else {
        this._lastHistoryError = res.error
      }
    } catch {}
    try {
      return await this.page.evaluate(scrapeGlmChatList, limit)
    } catch {
      return []
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

  /** The model catalogue (GET /api/models) so /model can list/pick a model. */
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
        this._notice(this._t('glm.model_error', { v: res.error }))
        return []
      }
      const data = (res?.data as Record<string, unknown>) || {}
      const list = Array.isArray(data.data) ? (data.data as unknown[]) : []
      const out: Array<{ id: string; name: string }> = []
      for (const m of list) {
        if (!m || typeof m !== 'object') continue
        const mm = m as Record<string, unknown>
        const id = typeof mm.id === 'string' ? mm.id : ''
        const info = mm.info as Record<string, unknown> | undefined
        const name =
          (typeof mm.name === 'string' && mm.name) ||
          (info && typeof info.name === 'string' && info.name) ||
          id
        if (id) out.push({ id, name })
      }
      return out
    } catch (e) {
      this._lastHistoryError = (e as Error).message
      this._notice(this._t('glm.model_error', { v: (e as Error).message }))
      return []
    }
  }

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
        { url: chatHistoryUrl(id), auth: this._apiAuth },
      )
      if (res?.error) {
        this._lastHistoryError = res.error
        return []
      }
      return parseGlmHistory(res.data)
    } catch (e) {
      this._lastHistoryError = (e as Error).message
      return []
    }
  }

  async readChatMessages(): Promise<ChatMessage[]> {
    if (!this.page) return []
    try {
      return await this.page.evaluate(scrapeGlmChatMessages, {
        containerSels: MESSAGE_CONTAINER_SELECTORS,
        thinkRe: THINK_CLASS_RE.source,
        userRe: USER_CLASS_RE.source,
      })
    } catch {
      return []
    }
  }

  async getCurrentChatId(): Promise<string | null> {
    try {
      const m = this.page.url().match(CHAT_ID_RE)
      if (m && m[1]) return m[1]
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

  async _readLastAnswerTextCleanDom(): Promise<string> {
    const raw = await this._readLastAnswerTextDom().catch(() => '')
    return cleanAnswer(raw)
  }

  async _readPageText(): Promise<string> {
    return await this.page.evaluate(readPageToastsInDom).catch(() => '')
  }

  async _chatSignal(): Promise<{ nodes: number; lastLen: number }> {
    return await this.page
      .evaluate(chatSignalInDom, {
        nodesSel: CHAT_SIGNAL_NODES_SELECTOR,
        mdSel: MARKDOWN_SELECTOR,
      })
      .catch(() => ({ nodes: 0, lastLen: 0 }))
  }

  /** Is the page generating right now (the send button swapped for a stop)? */
  async _stopButtonVisible(): Promise<boolean> {
    const explicit = await this._findVisible(STOP_SELECTORS, 250)
    if (explicit) return true
    // z.ai disables the input while generating; that is the reliable signal.
    const disabled = await this.page
      .evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null
        if (!el) return false
        return (
          el.disabled === true || el.getAttribute('aria-disabled') === 'true'
        )
      }, INPUT_SELECTORS[0])
      .catch(() => false)
    return !!disabled
  }

  /**
   * True while the page is still generating (the input is disabled or a stop
   * control is visible). Used to explain a missing send button instead of
   * blaming the selectors.
   */
  async _isGenerating(): Promise<boolean> {
    return await this._stopButtonVisible().catch(() => false)
  }

  /**
   * Wait (bounded) until the page stops generating. Returns true when it was
   * STILL generating at the deadline - the caller then reports "busy" rather
   * than "send button missing".
   */
  async _waitWhileGenerating(maxMs: number): Promise<boolean> {
    const deadline = Date.now() + maxMs
    while (Date.now() < deadline) {
      if (this._abort || this._askCancelled) return false
      if (!(await this._isGenerating())) return false
      await this.page.waitForTimeout(500)
    }
    return await this._isGenerating()
  }

  async _captchaVisible(): Promise<boolean> {
    try {
      const txt = await this.page.evaluate(() => {
        return document.body ? document.body.innerText : ''
      })
      return /security verification|drag the slider/i.test(String(txt || ''))
    } catch {
      return false
    }
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
    // No dedicated stop control was observed; Escape aborts the generation.
    try {
      await this.page.keyboard.press('Escape')
      return true
    } catch {}
    return false
  }

  /**
   * Select the configured model in z.ai's header dropdown. The site builds the
   * completion request from ITS OWN UI state, so a switch means clicking
   * button#model-selector-<id>-button and then the matching menu item. The
   * option is matched by a NORMALIZED label so a config id
   * (`glm-5.3`) matches the displayed name (`GLM-5.3`). Best-effort: a
   * missing dropdown never fails the send.
   */
  async _applyModel(): Promise<void> {
    if (!this.model) return
    const norm = (v: string): string =>
      String(v || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    const want = norm(this.model)
    if (!want) return
    try {
      const trigger = this.page.locator(MODEL_TRIGGER_SELECTOR).first()
      if ((await trigger.count().catch(() => 0)) === 0) return
      // The current id is IN the trigger's own id (verified live).
      const curId = await trigger
        .evaluate((el: Element) => el.id || '')
        .catch(() => '')
      if (norm(modelIdFromTriggerId(curId)) === want) return
      await trigger.click({ timeout: 2000 }).catch(() => {})
      await this.page.waitForTimeout(400)
      const clicked = await this.page
        .evaluate((w: string) => {
          const norm = (v: string): string =>
            (v || '').toLowerCase().replace(/[^a-z0-9]/g, '')
          for (const el of Array.from(
            document.querySelectorAll(
              'li, [role="option"], [role="menuitem"], [class*="option"], [class*="item"]',
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
    } catch {}
  }

  // ---------- toggles ----------

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
    return { deepThinking: this.deepThinking, webSearch: this.webSearch }
  }

  /**
   * The mode flags are asserted through the REQUEST BODY, not a UI toggle:
   * z.ai's chat/agent runtime (preview_mode, the `general_agent` flag, its own
   * mcp servers) changes the answer format and would break the zames tool-call
   * protocol. Part C turns thinking/search on; this part keeps them off.
   * No stable UI control for them was observed in the recon.
   */
  async _applyToggles(): Promise<void> {
    await this._applyModel()
    this._toggles = {
      deepThinking: this.deepThinking,
      webSearch: this.webSearch,
    }
    // GLM exposes no stable UI control for thinking / web search in the
    // observed build, so the desired state is carried by the request body the
    // SITE builds from its own UI. We therefore VERIFY the body after the send
    // (_verifyModes) rather than click a control that may not exist.
  }

  /**
   * Check the LAST completion request the page sent: unsafe modes must be off
   * (z.ai's own agent runtime breaks the zames tool-call protocol) and the
   * thinking/web-search flags should match the operator's setting. Best-effort
   * and NON-fatal: a mismatch is reported, the turn is not aborted.
   */
  _verifyModes(): void {
    const feat = this._lastBodyFeatures
    if (!feat) return
    const unsafe = unsafeGlmModes(feat)
    if (unsafe.length) {
      this._notice(this._t('glm.mode_flags', { v: unsafe.join(', ') }))
    }
    // Only the THINKING flag is actionable: GLM starts its own web search
    // regardless of the request flag, so a web_search mismatch was pure noise
    // (it fired on every send and told the operator nothing they could fix).
    const mismatch = glmFlagsMismatch(feat, {
      thinking: this.deepThinking,
      webSearch: feat.webSearch === true || feat.autoWebSearch === true,
    }).filter((m) => m !== 'web_search')
    if (mismatch.length) {
      this._notice(this._t('glm.mode_mismatch', { v: mismatch.join(', ') }))
    }
  }

  // ---------- diagnostics ----------

  async dumpDom(
    filePath: string,
  ): Promise<{ file: string; selectors: unknown }> {
    if (!this.page) throw new Error('glm: browser not launched')
    const html = await this.page.content()
    await fs.writeFile(filePath, html, 'utf-8')
    return { file: filePath, selectors: {} }
  }

  _uiCapabilities(): UiCapabilitySpec[] {
    return [
      { capability: 'input', selectors: INPUT_SELECTORS, critical: true },
      { capability: 'toggles', selectors: [], critical: false },
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

  chatUrl(id: string): string {
    return chatUrl(id)
  }

  // ---------- ask ----------

  async _waitForSendSlot(agent: boolean): Promise<void> {
    if (!agent) return
    const gap = this.sendRuntime.waitMs()
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
    // The exhausted-context recovery is a COMPACTION (a new chat), not a
    // resend, so it has its own budget.
    let contextLimitRetries = 0
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
          if (e instanceof GlmGuestLimitError) {
            this.sendRuntime.onOutcome('guest_limit', { errorText: msg })
            throw new Error(this._t('glm.guest_mode'))
          }
          if (
            isQuotaExhaustedText(msg) ||
            isQuotaExhaustedText(this._netBody)
          ) {
            this.sendRuntime.onOutcome('rate_limit', { errorText: 'quota' })
            throw new Error(this._t('glm.quota_exhausted'))
          }
          // Checked BEFORE the rate-limit/captcha branches below: those
          // retry IN PLACE, which an exhausted chat can never accept.
          if (e instanceof GlmContextLimitError) {
            contextLimitRetries++
            const res = await recoverFromContextLimit(
              {
                recover: () => this.onContextLimit?.() ?? Promise.resolve(false),
                maxRetries: this.maxContextLimitRetries,
                attempt: contextLimitRetries,
                notice: (text) => this._notice(text),
                t: (k, p) => this._t(k, p),
                keys: {
                  compact: 'glm.context_limit_compact',
                  compactFailed: 'glm.context_limit_compact_failed',
                  giveUp: 'glm.context_limit_give_up',
                },
                provider: 'GLM',
              },
              e,
            )
            if (!res.resend) throw res.error || e
            this._lastSentAt = Date.now()
            continue
          }
          if (e instanceof GlmCaptchaError) {
            this.sendRuntime.onOutcome('guest_limit', { errorText: 'captcha' })
            throw new Error(this._t('glm.captcha'))
          }
          if (/rate limit|too frequent/i.test(msg)) {
            this.sendRuntime.onOutcome('rate_limit', { errorText: msg })
            if (rateLimitRetries >= this.maxRateLimitRetries) break
            rateLimitRetries++
            this._notice(
              this._t('glm.rate_limit_wait', {
                min: Math.ceil(this.rateLimitWaitMs / 60000),
                attempt: rateLimitRetries,
                max: this.maxRateLimitRetries,
              }),
            )
            if (await this._sleepInterruptible(this.rateLimitWaitMs))
              return '(прервано пользователем)'
            continue
          }
          if (e instanceof GlmServerBusyError || /server busy/i.test(msg)) {
            this.sendRuntime.onOutcome('busy', { errorText: msg })
            if (serverBusyRetries >= this.maxServerBusyRetries) break
            serverBusyRetries++
            this._notice(
              this._t('glm.server_busy_wait', {
                sec: Math.ceil(this.serverBusyWaitMs / 1000),
                attempt: serverBusyRetries,
                max: this.maxServerBusyRetries,
              }),
            )
            if (await this._sleepInterruptible(this.serverBusyWaitMs))
              return '(прервано пользователем)'
            continue
          }
          if (e instanceof GlmIncompleteError) {
            this.sendRuntime.onOutcome('incomplete', { errorText: msg })
            if (incompleteRetries >= this.maxIncompleteRetries) break
            incompleteRetries++
            this._notice(
              this._t('glm.incomplete_retry', {
                attempt: incompleteRetries,
                max: this.maxIncompleteRetries,
              }),
            )
            if (await this._sleepInterruptible(this.incompleteWaitMs))
              return '(прервано пользователем)'
            continue
          }
          if (
            /target page, context or browser has been closed|page.*has been closed/i.test(
              msg,
            )
          ) {
            this._notice(this._t('glm.restart_browser'))
            try {
              await this.restart()
              await this.waitForLogin()
            } catch (re) {
              this._notice(
                this._t('glm.restart_failed', {
                  error: (re as Error).message,
                }),
              )
            }
          }
          this._notice(
            this._t('glm.ask_retry', {
              attempt: attempt + 1,
              max: this.askRetries,
              error: msg,
            }),
          )
          if (attempt < this.askRetries - 1) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
          }
          attempt++
        }
      }
      throw new Error(
        this._t('glm.ask_failed', {
          max: this.askRetries,
          error: lastErr?.message || '',
        }),
      )
    } finally {
      this._askInFlight = Math.max(0, this._askInFlight - 1)
      void this._setBusyTitle(false)
    }
  }

  async _setInputText(input: Locator, text: string): Promise<void> {
    const tag = await input.evaluate((el: Element) => el.tagName.toLowerCase())
    if (tag === 'textarea' || tag === 'input') {
      try {
        await input.fill(text, { timeout: 5000 })
        return
      } catch {}
    }
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

  async _attachFiles(
    files: Array<{ path: string; name: string; mime: string }>,
  ): Promise<Array<{ path: string; name: string }>> {
    const { payload: bufPayload, failed } = await readAttachBuffers(
      files,
      (name, error) =>
        this._notice(
          theme.warn(this._t('glm.attach_read_failed', { name, error })),
        ),
    )
    if (!bufPayload.length) return failed
    // Primary flow: the observed upload control is button#upload-file-button,
    // which fires a real filechooser (the same shape as Qwen's menu item).
    try {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser', { timeout: 5000 }),
        this.page
          .locator(UPLOAD_BUTTON_SELECTOR)
          .first()
          .click({ timeout: 3000 }),
      ])
      await chooser.setFiles(bufPayload)
      await this._awaitUploadPreview(
        files.map((f) => f.name),
        5000,
      )
      return failed
    } catch {}
    // Fallback: set the files directly on the hidden <input type=file>.
    for (const sel of ['input[type="file"]']) {
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
    this._notice(this._t('glm.attach_no_input'))
    for (const f of files) failed.push({ path: f.path, name: f.name })
    return failed
  }

  async _awaitUploadPreview(names: string[], timeoutMs: number): Promise<void> {
    await awaitUploadPreview(this.page, names, timeoutMs)
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

    await this._awaitInput(10_000)
    let input = await this._findVisible(INPUT_SELECTORS, 3000)
    if (!input) {
      try {
        await this.page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
        await this._awaitInput(10_000)
        input = await this._findVisible(INPUT_SELECTORS, 3000)
      } catch {}
    }
    if (!input) throw new Error(this._t('glm.input_missing'))

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
    // The throttle records this send; its outcome is filled in below.
    this.sendRuntime.onSend({
      model: this.model,
      thinking: this.deepThinking,
      webSearch: this.webSearch,
    })
    this._netCapture = ''
    this._netCaptureAt = 0
    this._netNoAnswer = false
    this._netRateLimited = false
    this._netGuestLimit = false
    this._netServerBusy = false
    this._netContextLimit = false
    this._netCaptcha = false
    this._netBody = ''

    await this._applyToggles()
    if (attachments.length) {
      const failed = await this._attachFiles(attachments)
      prompt = rewriteFailedAttachments(prompt, failed)
    }
    await this._setInputText(input, prompt)

    const sendDeadline =
      Date.now() + (attachments.length ? 30_000 : this.sendButtonWaitMs)
    const preSendSignal = await this._chatSignal()
    let sent = false
    while (!sent && Date.now() < sendDeadline) {
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
      if (!clicked) {
        await this.page.keyboard.press('Enter').catch(() => {})
      }

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
      if (await this._captchaVisible().catch(() => false)) {
        throw new GlmCaptchaError('captcha blocks the send')
      }
      // A PAGE THAT IS STILL GENERATING hides/disabled the send control. That
      // is not a broken button: the previous turn (often a long z.ai web
      // search) is still running. Wait for it to settle before failing, so a
      // slow turn does not turn into "send button not found" + a retry storm.
      const settled = await this._waitWhileGenerating(120_000)
      if (settled) {
        throw new Error(this._t('glm.page_busy'))
      }
      throw new Error(this._t('glm.send_button_missing'))
    }
    // The site has just built the request: check the mode flags it used.
    this._verifyModes()

    // Wait for the answer to start, then for it to settle.
    const startDeadline = Date.now() + this.startWaitMs
    const startSignal = await this._chatSignal()
    let started = false
    while (Date.now() < startDeadline) {
      if (this._abort || this._askCancelled) return '(прервано пользователем)'
      const pageText = await this._readPageText()
      if (await this._captchaVisible().catch(() => false)) {
        throw new GlmCaptchaError('captcha blocks the answer')
      }
      if (isRateLimitText(pageText)) {
        throw new GlmRateLimitError(pageText.slice(0, 300))
      }
      if (this._netContextLimit && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmContextLimitError(this._netBody.slice(0, 300))
      }
      if (this._netCaptcha && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmCaptchaError(this._netBody.slice(0, 200))
      }
      if (this._netGuestLimit && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmGuestLimitError(this._netBody.slice(0, 200))
      }
      if (this._netRateLimited && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmRateLimitError(this._netBody.slice(0, 300))
      }
      if (this._netServerBusy && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmServerBusyError(this._netBody.slice(0, 300))
      }
      const sig = await this._chatSignal()
      if (sig.nodes > startSignal.nodes || sig.lastLen > startSignal.lastLen) {
        started = true
        break
      }
      await this.page.waitForTimeout(200)
    }
    if (!started && !this._netCapture) {
      await this.page.waitForTimeout(1500)
    }

    const deadline = Date.now() + timeout
    let last = ''
    let stable = 0
    while (Date.now() < deadline) {
      if (this._abort || this._askCancelled) return '(прервано пользователем)'
      const pageText = await this._readPageText()
      if (await this._captchaVisible().catch(() => false)) {
        throw new GlmCaptchaError('captcha blocks the answer')
      }
      if (isRateLimitText(pageText)) {
        throw new GlmRateLimitError(pageText.slice(0, 300))
      }
      if (this._netContextLimit && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmContextLimitError(this._netBody.slice(0, 300))
      }
      if (this._netCaptcha && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmCaptchaError(this._netBody.slice(0, 200))
      }
      if (this._netGuestLimit && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmGuestLimitError(this._netBody.slice(0, 200))
      }
      if (this._netRateLimited && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmRateLimitError(this._netBody.slice(0, 300))
      }
      if (this._netServerBusy && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmServerBusyError(this._netBody.slice(0, 300))
      }
      if (this._netNoAnswer && this._netCaptureAt >= this._lastSentAt) {
        throw new GlmIncompleteError('finished without answer')
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
        if (answer && answer !== beforeText) {
          this.sendRuntime.onOutcome('ok')
          return answer
        }
      }
      await this.page.waitForTimeout(this.stabilityDelayMs)
    }
    const answer = this._netCapture || last
    if (answer && answer !== beforeText) {
      this.sendRuntime.onOutcome('ok')
      return answer
    }
    this.sendRuntime.onOutcome('incomplete', { errorText: 'no new answer' })
    throw new Error(this._t('glm.send_no_new_answer'))
  }
}

// GLM-specific error classes so ask() can branch on the retryable families.
class GlmRateLimitError extends Error {
  constructor(detail: string) {
    super('rate limit: ' + detail)
    this.name = 'GlmRateLimitError'
  }
}
class GlmGuestLimitError extends Error {
  constructor(detail: string) {
    super('guest limit: ' + detail)
    this.name = 'GlmGuestLimitError'
  }
}
class GlmCaptchaError extends Error {
  constructor(detail: string) {
    super('captcha: ' + detail)
    this.name = 'GlmCaptchaError'
  }
}
// The chat context window is exhausted and the turn was refused. NOT
// retryable in place: ask() compacts into a fresh chat and resends there.
class GlmContextLimitError extends Error {
  constructor(detail: string) {
    super('context limit: ' + detail)
    this.name = 'GlmContextLimitError'
  }
}
class GlmIncompleteError extends Error {
  constructor(detail: string) {
    super('generation incomplete: ' + detail)
    this.name = 'GlmIncompleteError'
  }
}
class GlmServerBusyError extends Error {
  constructor(detail: string) {
    super('server busy: ' + detail)
    this.name = 'GlmServerBusyError'
  }
}
