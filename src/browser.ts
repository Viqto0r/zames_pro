import {
  chromium,
  type BrowserContext,
  type Page,
  type Locator,
} from 'playwright'
import { extractAnswer, dumpNetBody } from './net-capture.js'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execSync } from 'child_process'
import { theme } from './theme.js'
import { translate, DEFAULT_LOCALE, type Locale } from './i18n.js'

// Muted terminal input for passwords. We do NOT use readline here: readline
// echoes the typed text through its own internal _writeToOutput, which cannot
// be reliably overridden from outside (a real bug: the login prompt swallowed
// the password step). Instead we read raw keystrokes from stdin and echo one
// `*` per typed character. In a non-TTY (pipe/redirect) we fall back to a
// plain line read.
export function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)

    // Non-interactive: read a single line from stdin as-is.
    if (!process.stdin.isTTY) {
      void import('readline').then(({ createInterface }) => {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        rl.question('', (answer: string) => {
          rl.close()
          resolve(answer)
        })
      })
      return
    }

    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    stdin.setRawMode(true)
    stdin.resume()

    let value = ''
    const onData = (buf: Buffer): void => {
      const s = buf.toString('utf8')
      for (const ch of s) {
        const code = ch.charCodeAt(0)
        // Enter / Ctrl+J -> done.
        if (ch === '\r' || ch === '\n') {
          done()
          return
        }
        // Ctrl+C -> abort the whole process (same as elsewhere in the CLI).
        if (code === 3) {
          cleanup()
          process.stdout.write('\n')
          process.exit(130)
        }
        // Ctrl+D -> finish with whatever we have.
        if (code === 4) {
          done()
          return
        }
        // Backspace (0x7f or 0x08): remove the last char and one star.
        if (code === 127 || code === 8) {
          if (value.length > 0) {
            value = value.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        // Ignore other control characters (arrows, etc.).
        if (code < 32) continue
        value += ch
        process.stdout.write('*')
      }
    }

    const cleanup = (): void => {
      stdin.removeListener('data', onData)
      try {
        stdin.setRawMode(wasRaw || false)
      } catch {}
      stdin.pause()
    }

    const done = (): void => {
      cleanup()
      process.stdout.write('\n')
      resolve(value)
    }

    stdin.on('data', onData)
  })
}

const USER_DATA_DIR = path.join(os.homedir(), '.zames', 'profile')
const CHAT_URL = 'https://chat.deepseek.com/'

// A headless Chrome advertises "HeadlessChrome/..." in its User-Agent, and
// DeepSeek's CDN (CloudFront/WAF) rejects that UA with a plain "403 ERROR"
// page before the app is even served — so a headless login looked broken while
// a headed one worked (headed Chrome sends "Chrome/..."). We keep the real
// engine version and only drop the "Headless" marker. When the operator
// explicitly set a UA in the config, that one wins (see _launchOnce).
export function sanitizeHeadlessUA(ua: string): string {
  return String(ua || '').replace(/HeadlessChrome/g, 'Chrome')
}
// Written after a successful sign-in so the next launch knows a session was
// stored in the persistent profile (used by /doctor and diagnostics).
const AUTH_MARKER_FILE = path.join(os.homedir(), '.zames', 'auth.json')

// DeepSeek sign-in form. The login page is served on the same origin and
// swaps in a password field; the exact classes change, so we match loosely on
// input types and the known placeholder/autocomplete attributes.
const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
]

const LOGIN_SELECTORS = [
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

const LOGIN_SUBMIT_SELECTORS = [
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

const INPUT_SELECTORS = [
  'textarea',
  'div[contenteditable="true"]',
  '[role="textbox"]',
]

const ANSWER_SELECTORS = [
  'div.ds-assistant-message-main-content',
  'div[class*="ds-assistant-message-main-content"]',
  'div[class*="ds-markdown"]',
  'div[class*="markdown"]',
]

const SEND_SELECTORS = [
  'div[role="button"].ds-button--primary.ds-button--circle',
  'div[role="button"].ds-button--primary.ds-button--filled',
  'button[type="submit"]',
  'button[aria-label*="send" i]',
  'button[aria-label*="отправ" i]',
]

// IMPORTANT: you MUST NOT add the generic 'div[role="button"][class*="ds-button--primary"]'
// here — it matches the send button, which is always visible, and then
// _isGenerating() always returns true, so the answer is never considered ready.
const STOP_SELECTORS = [
  'div[role="button"][aria-label*="stop" i]',
  'div[role="button"][aria-label*="останов" i]',
  'button:has-text("Stop")',
  'button:has-text("Остановить")',
  'button[aria-label*="Stop" i]',
]

// DeepSeek UI service statuses that are NOT the model's answer.
// Otherwise the agent takes a status (Reading...) for an answer and breaks parsing.
const STATUS_RE =
  /^(reading|thinking|searching|analyzing|generating|stop|остановить|читаю|думаю|поиск|анализ)[\s.…]*$/i

// DeepSeek's answer when the rate limit is exceeded.
const RATE_LIMIT_RE =
  /(messages? too frequent|too many requests|rate limit|слишком часто|повторите позже|try again later)/i

// Transient server-side hiccups (DeepSeek overloaded / hiccup). Unlike the
// rate limit, these usually clear in seconds, so we retry quickly instead of
// waiting minutes. "Server busy", 503, "temporarily unavailable", etc.
const SERVER_BUSY_RE =
  /(server (is )?busy|server error|service (is )?unavailable|temporarily unavailable|internal server error|502|503|504|server overloaded|сервер занят|сервер перегружен|сервис недоступен|внутренняя ошибка|попробуйте позже)/i

export function isRateLimitText(text: string): boolean {
  return RATE_LIMIT_RE.test(String(text || ''))
}

export function isServerBusyText(text: string): boolean {
  const t = String(text || '')
  // Rate limit takes priority (it needs the long wait).
  if (RATE_LIMIT_RE.test(t)) return false
  return SERVER_BUSY_RE.test(t)
}

// Normalize text for comparison: collapse whitespace so that tiny DOM
// differences (nbsp, trailing spaces) don't count as "a new answer".
export function normText(s: string): string {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The "too frequent" error: distinct from others so ask() waits a long time
// (DeepSeek limits reset over minutes) and retries the send itself.
export class RateLimitError extends Error {
  constructor(detail: string) {
    super('Messages too frequent. Try again later. ' + detail)
    this.name = 'RateLimitError'
  }
}
// DeepSeek transient server error (Server busy).
export class ServerBusyError extends Error {
 constructor(detail: string) {
 super('Server busy. Try again later. ' + detail)
 this.name = 'ServerBusyError'
 }
}

// ---------- profile cleanup ----------

async function killStaleChrome() {
  if (process.platform !== 'win32') return
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*\\.zames\\profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore', timeout: 5000 },
    )
    await new Promise((r) => setTimeout(r, 800))
  } catch {}
}

async function cleanSingletonFiles() {
  const names = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
  for (const name of names) {
    const p = path.join(USER_DATA_DIR, name)
    try {
      await fs.unlink(p)
    } catch {}
  }
}

async function profileLooksLocked() {
  try {
    await fs.access(path.join(USER_DATA_DIR, 'SingletonLock'))
    return true
  } catch {
    return false
  }
}

async function nukeProfile() {
  try {
    await fs.rm(USER_DATA_DIR, { recursive: true, force: true })
  } catch {}
}

// ---------- class ----------

export interface DeepSeekBrowserOptions {
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
  /** Enable DeepSeek's "Deep thinking" toggle (reasoning; slow). */
  deepThinking?: boolean
  /** Enable DeepSeek's "Smart search" (web search) toggle. */
  webSearch?: boolean
  /** Credentials for automatic sign-in when the session is logged out. */
  auth?: {
    username?: string
    password?: string
    saveSession?: boolean
  }
  /** Interface language for login prompts shown by the browser. */
  locale?: Locale
  /** Called after a successful interactive login, with the credentials used. */
  onAuthSave?: (username: string, password: string) => void
  /**
   * Explicit User-Agent. When omitted, the browser derives one from the real
   * engine version and strips the "Headless" marker (DeepSeek's CDN 403s a
   * "HeadlessChrome/..." UA).
   */
  userAgent?: string
}

export interface ChatInfo {
  id: string
  title: string
  href?: string
}

export class DeepSeekBrowser {
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
  // Desired state of the DeepSeek chat toggles, applied before each send.
  // deepThinking: the "Deep thinking" toggle (reasoning; the reasoning text
  // is never read/shown). webSearch: the "Smart search" toggle.
  deepThinking: boolean
  webSearch: boolean
  // Credentials for automatic sign-in. The password is stored in the config
  // file (~/.zames/config.json) and is used only when DeepSeek has logged the
  // session out. `saveSession` keeps the profile (cookies) so a fresh launch
  // reuses the session instead of asking the operator every time.
  auth: { username: string; password: string; saveSession: boolean }
  // Interface language for the login prompts printed by the browser itself.
  locale: Locale
  // Called after a successful interactive login so index.ts can persist the
  // credentials into the user config (the browser does not write config).
  onAuthSave: ((username: string, password: string) => void) | null
  _lastSentAt: number
  _abort: boolean
  // The user pressed Esc/Ctrl+C — a "stop" for the WHOLE current batch of
  // tasks (including the queue). Unlike _abort (reset on every send), this
  // flag lives until a new task is explicitly started from the prompt.
  _stopped: boolean
  context!: BrowserContext
  page!: Page
  _netCapture: string
  _netCaptureAt: number
  _netChatId: string | null
  _netSniff: Array<{ url: string; contentType: string; body: string }>
  _netSniffLimit: number
  _netHookInstalled: boolean
  // Fired right when a message is actually typed/sent (AFTER the send-pause
  // and attachments). Used to start the "agent is working" spinner only when
  // a generation really begins, not during the pre-send phase (chat open,
  // throttle wait), which used to show a spinner with no work in flight.
  onSendStart: (() => void) | null
  // Fired when the agent starts waiting out the send-interval pause, with the
  // remaining seconds. Lets the UI animate the pause status instead of
  // printing a static line (the dots used to be frozen during the pause).
  onSendPause: ((seconds: number) => void) | null
  // User-Agent sent by the browser. In headless mode the "Headless" marker
  // must be stripped (DeepSeek's CDN answers 403 to it); computed in the
  // constructor, overridable by an explicit UA in the options/config.
  userAgent: string

  constructor({
    headless = false,
    debug = false,
    channel = 'chrome',
    answerTimeoutMs = 180000,
    askRetries = 3,
    stabilityChecks = 2,
    stabilityDelayMs = 400,
    minSendIntervalMs = 15000,
    rateLimitWaitMs = 300000,
    maxRateLimitRetries = 6,
 maxServerBusyRetries = 5,
 serverBusyWaitMs = 3000,
    deepThinking = false,
    webSearch = true,
    auth,
    locale,
    onAuthSave,
    userAgent,
  }: DeepSeekBrowserOptions = {}) {
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
    this.deepThinking = deepThinking
    this.webSearch = webSearch
    this.auth = {
      username: (auth?.username || '').trim(),
      password: auth?.password || '',
      saveSession: auth?.saveSession !== false,
    }
    this.locale = locale || DEFAULT_LOCALE
    this.onAuthSave = onAuthSave || null
    this._lastSentAt = 0
    this._abort = false
    this._stopped = false
    this._netCapture = ''
    this._netCaptureAt = 0
    this._netChatId = null
    this._netSniff = []
    this._netSniffLimit = 5
    this._netHookInstalled = false
    this.onSendStart = null
    this.onSendPause = null
    // An explicit UA (config/options) is respected as-is. Otherwise it stays
    // empty here and is derived from the real engine UA after launch — see
    // _fixHeadlessUserAgent (a headless "HeadlessChrome/..." UA gets 403 from
    // DeepSeek's CDN).
    this.userAgent = userAgent ? sanitizeHeadlessUA(userAgent) : ''
  }

  /** Translation bound to this browser's locale. */
  _t(key: string, params?: Record<string, string | number>): string {
    return translate(this.locale)(key, params)
  }

  async launch(): Promise<void> {
    await killStaleChrome()
    if (await profileLooksLocked()) {
      if (this.debug) console.error('profile: удаляю Singleton-файлы')
      await cleanSingletonFiles()
    }
    await this._launchOnce()
    await this._fixHeadlessUserAgent()
  }

  /**
   * A headless Chromium advertises "HeadlessChrome/<v>" in its User-Agent, and
   * DeepSeek's CDN (CloudFront/WAF) answers that UA with a plain "403 ERROR"
   * page before the app is served — so sign-in worked with a visible window and
   * silently failed headless. Read the UA the engine really reports and, when
   * it carries the "Headless" marker, relaunch once with a sanitized
   * `--user-agent` (the marker removed, the real version kept). A UA passed
   * explicitly in the options/config is never touched.
   */
  async _fixHeadlessUserAgent(): Promise<void> {
    if (!this.headless) return
    try {
      const ua: string = await this.page.evaluate(() => navigator.userAgent)
      const fixed = sanitizeHeadlessUA(ua)
      if (fixed === ua) return
      this.userAgent = fixed
      if (this.debug)
        console.error('profile: headless UA → перезапуск с обычным Chrome UA')
      await this.context.close().catch(() => {})
      await this._launchOnce()
    } catch (e) {
      if (this.debug) console.error('profile: UA-фикс не удался:', (e as Error).message)
    }
  }

  async _launchOnce(): Promise<void> {
    const options: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: this.headless,
      // 30ms slowMo per Playwright action added up over thousands of DOM
      // actions per run. The waits we need are explicit; keep a small value
      // for stability of clicks/typing.
      slowMo: 10,
      args: ['--disable-blink-features=AutomationControlled'],
    }
    if (this.channel) options.channel = this.channel
    if (this.userAgent) options.userAgent = this.userAgent

    try {
      this.context = await chromium.launchPersistentContext(
        USER_DATA_DIR,
        options,
      )
    } catch (e) {
      if (
        /Target page, context or browser has been closed|profile.*in use/i.test(
          (e as Error).message,
        )
      ) {
        if (this.debug)
          console.error('profile: занят, перезапускаю после очистки')
        await killStaleChrome()
        await cleanSingletonFiles()

        try {
          this.context = await chromium.launchPersistentContext(
            USER_DATA_DIR,
            options,
          )
        } catch (e2) {
          if (this.debug) console.error('profile: сношу целиком')
          await nukeProfile()
          this.context = await chromium.launchPersistentContext(
            USER_DATA_DIR,
            options,
          )
        }
      } else {
        throw e
      }
    }

    this.page = this.context.pages()[0] || (await this.context.newPage())
    this._installNetHook()
    await this.page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
  }

  _installNetHook(): void {
    if (this._netHookInstalled) return
    const pg = this['page']
    if (!pg) return
    this._netHookInstalled = true
    pg.on('response', (resp: import('playwright').Response) => {
      void this._onResponse(resp).catch(() => {})
    })
  }

  async _onResponse(resp: import('playwright').Response): Promise<void> {
    try {
      const url = resp.url()
      if (!/deepseek\.com/i.test(url)) return
      if (/\.(js|css|png|jpg|jpeg|svg|woff2?|ico|map)(\?|$)/i.test(url)) return
      const ct = (resp.headers()['content-type'] || '').toLowerCase()
      const interesting =
        ct.includes('event-stream') ||
        ct.includes('json') ||
        ct.includes('text/plain')
      if (!interesting) return

      const body = await resp.text().catch(() => '')
      if (!body) return

      this._netSniff.push({ url, contentType: ct, body })
      if (this._netSniff.length > this._netSniffLimit) this._netSniff.shift()
      void dumpNetBody(url, body)

      const extracted = extractAnswer(body)
      if (extracted) {
        this._netCapture = extracted
        const cid = url.match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
        )
        if (cid) this._netChatId = cid[0]
        this._netCaptureAt = Date.now()
      }
    } catch {}
  }

  async restart(): Promise<void> {
    try {
      if (this.context) await this.context.close()
    } catch {}
    await this.launch()
  }

  async waitForLogin(): Promise<void> {
    // 1) Already signed in (session cookie in the persistent profile)?
    if (await this.isLoggedIn()) {
      if (this.debug) console.error('auth: сессия уже активна')
      return
    }

    // 2) Try to sign in automatically with the saved credentials. The
    //    password lives in the config (~/.zames/config.json) and is only used
    //    when the session is logged out — i.e. exactly the "re-login without
    //    asking" case. If the login form is absent (e.g. DeepSeek uses a
    //    captcha / another provider), this fails and we fall through.
    if (this.auth.username && this.auth.password) {
      console.log(theme.system(this._t('auth.auto_login')))
      const ok = await this._autoLogin().catch((e) => {
        console.log(theme.warn(this._t('auth.auto_login_failed', { v: (e as Error).message })))
        return false
      })
      if (ok) {
        console.log(theme.assistant(this._t('auth.auto_login_ok')))
        return
      }
    }

    // 3) Ask the operator for credentials in the terminal, try them, and
    //    only then fall back to the manual hint. Interactive only: in a
    //    pipe/redirect (or headless without credentials) we print a hint.
    const asked = await this._promptAndLogin().catch((e) => {
      if (this.debug) console.error('auth: prompt error:', (e as Error).message)
      return false
    })
    if (asked) return

    // 4) Last resort: manual sign-in in the browser window.
    console.log('\n' + theme.warn(this._t('auth.need_login')))
    if (this.headless) {
      console.log('   ' + this._t('auth.manual_hint_headless'))
    } else {
      console.log('   ' + this._t('auth.manual_hint'))
    }
    console.log('\n')

    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    await new Promise<void>((resolve) => {
      rl.question('', () => {
        rl.close()
        resolve()
      })
    })
    if (await this.isLoggedIn()) {
      await this._persistSessionIfNeeded()
      console.log(theme.assistant(this._t('auth.auto_login_ok')))
    }
  }

  /**
   * Try to sign in with this.auth. Returns true when the login form was
   * filled and the session became active. Never throws for a missing form —
   * the caller decides whether to fall back.
   */
  async _autoLogin(): Promise<boolean> {
    const filled = await this._fillLoginForm(this.auth.username, this.auth.password)
    if (!filled) return false
    const ok = await this._waitLoggedIn(20_000)
    if (ok) await this._persistSessionIfNeeded()
    return ok
  }

  /**
   * Ask the operator for login/password in the terminal (only in a TTY) and
   * try them. An empty password falls back to the saved one. Returns true
   * when the sign-in succeeded.
   */
  async _promptAndLogin(): Promise<boolean> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return false
    const hasSaved = !!(this.auth.username && this.auth.password)
    // Prompt only when we have a login field to fill.
    if (!(await this._loginFormVisible())) {
      if (this.debug) console.error('auth: форма входа не найдена')
      return false
    }

    console.log('\n' + theme.warn(this._t('auth.need_login')))

    // Username via a normal readline question (echoed).
    let user = this.auth.username
    if (!user) {
      const readline = await import('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      })
      user = (
        await new Promise<string>((resolve) =>
          rl.question(this._t('auth.prompt_login'), (a) => resolve(a)),
        )
      ).trim()
      rl.close()
    }

    // Password via raw keystroke reading, echoed as `*` (readline would echo
    // it in clear or swallow the prompt — see askPassword).
    const passPromptKey = hasSaved
      ? 'auth.prompt_password_saved'
      : 'auth.prompt_password'
    const pass = await askPassword(this._t(passPromptKey))

    const password = pass || this.auth.password
    if (!user || !password) return false

    console.log(theme.system(this._t('auth.auto_login')))
    const filled = await this._fillLoginForm(user, password)
    if (!filled) {
      console.log(theme.warn(this._t('auth.form_not_found')))
      return false
    }
    const ok = await this._waitLoggedIn(20_000)
    if (ok) {
      // Remember the credentials so the next launch can re-login silently.
      this.auth.username = user
      this.auth.password = password
      await this._persistSessionIfNeeded()
      this.onAuthSave?.(user, password)
      console.log(theme.assistant(this._t('auth.auto_login_ok')))
    } else {
      // Detect a credentials error shown by DeepSeek, otherwise report a
      // generic failure with the page hint so the operator can react.
      const reason = await this._readLoginError()
      if (reason) {
        console.log(theme.error(this._t('auth.login_rejected', { v: reason })))
      } else {
        console.log(theme.warn(this._t('auth.auto_login_failed', { v: this._t('auth.no_reason') })))
      }
    }
    return ok
  }

  /**
   * Read a visible login/credentials error message from the page, if any.
   * Best-effort: returns '' when nothing recognizable is found.
   */
  async _readLoginError(): Promise<string> {
    try {
      const txt = await this.page.evaluate(() => {
        const sels = [
          '[role="alert"]',
          '[class*="error" i]',
          '[class*="toast" i]',
          '[class*="notification" i]',
        ]
        let out = ''
        for (const s of sels) {
          for (const el of Array.from(document.querySelectorAll(s))) {
            const e = el as HTMLElement
            const st = getComputedStyle(e)
            if (st.display === 'none' || st.visibility === 'hidden') continue
            const t = (e.innerText || '').trim()
            if (t) out += ' ' + t
          }
        }
        return out.replace(/\s+/g, ' ').trim()
      })
      return txt.slice(0, 200)
    } catch {
      return ''
    }
  }

  /** Is a login form (password field) present on the page? */
  async _loginFormVisible(): Promise<boolean> {
    return await this.page
      .locator(PASSWORD_SELECTORS.join(', '))
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)
  }

  /**
   * Fill the DeepSeek sign-in form with the given credentials and submit it.
   * Returns false if the form (or the submit button) is not found.
   */
  async _fillLoginForm(username: string, password: string): Promise<boolean> {
    const pwd = await this._findVisible(PASSWORD_SELECTORS, 4000)
    if (!pwd) return false

    // The email/phone field is the text input above the password field. Try
    // the known selectors first, then fall back to the nearest text input.
    let userInput: Locator | null = await this._findVisible(LOGIN_SELECTORS, 2000)
    if (!userInput) {
      // Find the index of the password input and use the closest preceding
      // text/email/tel input as the login field.
      const idx = await this.page.evaluate((pwdSel: string) => {
        const p = document.querySelector(pwdSel) as HTMLInputElement | null
        if (!p) return -1
        const inputs = Array.from(
          document.querySelectorAll('input'),
        ) as HTMLInputElement[]
        const pi = inputs.indexOf(p)
        for (let i = pi - 1; i >= 0; i--) {
          const t = (inputs[i].type || 'text').toLowerCase()
          if (t === 'text' || t === 'email' || t === 'tel') return i
        }
        return -1
      }, PASSWORD_SELECTORS[0])
      if (idx >= 0) userInput = this.page.locator('input').nth(idx)
    }
    if (!userInput) return false

    await this._setInputText(userInput, username)
    await this._setInputText(pwd, password)
    await this.page.waitForTimeout(150)

    // Submit. DeepSeek's login form is a React form; the button text is
    // localized and classes change, so we try, in order:
    //   1. known submit selectors;
    //   2. a submit/primary button inside the same <form> as the password;
    //   3. pressing Enter in the password field;
    //   4. clicking the password field's closest button sibling.
    // After each attempt we give the login a short window and stop as soon as
    // it succeeds, so a stray click does not fire on an already-logged-in page.
    const tryLogin = async (): Promise<boolean> => {
      if (await this._waitLoggedIn(3000)) return true
      return false
    }

    // Precise first attempt: DeepSeek's button is
    // <div role="button" class="ds-button ds-button--primary ...">
    //   <span class="ds-button__content">Log in</span></div>
    // Click exactly the one whose visible label is a login word, so we never
    // hit "Log in with Google" or another primary button by mistake.
    const precise = this.page
      .locator('div[role="button"].ds-button--primary, button')
      .filter({ hasText: /^\s*(log ?in|sign ?in|войти)\s*$/i })
    const pc = await precise.count().catch(() => 0)
    if (pc > 0) {
      try {
        await precise.last().click({ timeout: 2000 })
        if (await tryLogin()) return true
      } catch {}
    }

    for (const sel of LOGIN_SUBMIT_SELECTORS) {
      const btn = this.page.locator(sel).last()
      try {
        if ((await btn.count()) === 0) continue
        if (!(await btn.isVisible().catch(() => false))) continue
        await btn.click({ timeout: 2000 })
        if (await tryLogin()) return true
      } catch {}
    }

    // Button inside the same form as the password field.
    const formClicked = await this.page
      .evaluate((pwdSel: string) => {
        const p = document.querySelector(pwdSel) as HTMLInputElement | null
        if (!p) return false
        const form = p.closest('form')
        const scope: ParentNode = form || document
        const btns = Array.from(
          scope.querySelectorAll(
            'button[type="submit"], button, div[role="button"]',
          ),
        ) as HTMLElement[]
        for (const b of btns) {
          const txt = (b.textContent || '').trim().toLowerCase()
          const aria = (b.getAttribute('aria-label') || '').toLowerCase()
          if (/log ?in|sign ?in|войти|continue|продолж/.test(txt + ' ' + aria)) {
            b.click()
            return true
          }
        }
        // Fallback: the primary-looking button in the scope.
        const primary = btns.find((b) => {
          const cls = (b.className || '').toString()
          return /primary|submit|ds-button--primary/i.test(cls)
        })
        if (primary) {
          primary.click()
          return true
        }
        return false
      }, PASSWORD_SELECTORS[0])
      .catch(() => false)
    if (formClicked && (await tryLogin())) return true

    // Enter in the password field.
    await pwd.press('Enter').catch(() => {})
    return true
  }

  /** Poll isLoggedIn until it succeeds or the deadline passes. */
  async _waitLoggedIn(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.isLoggedIn().catch(() => false)) return true
      await this.page.waitForTimeout(500)
    }
    return false
  }

  /**
   * Persist the authenticated session. The persistent profile already keeps
   * cookies on disk; `saveSession` (config) is kept as an explicit toggle for
   * the operator. We additionally save a small marker so /doctor and the next
   * launch can tell that a session exists.
   */
  async _persistSessionIfNeeded(): Promise<void> {
    if (!this.auth.saveSession) return
    if (!(await this.isLoggedIn().catch(() => false))) return
    try {
      await fs.mkdir(path.join(os.homedir(), '.zames'), { recursive: true })
      await fs.writeFile(
        AUTH_MARKER_FILE,
        JSON.stringify({ at: new Date().toISOString() }, null, 2),
        'utf-8',
      )
    } catch {}
  }

  async isLoggedIn(): Promise<boolean> {
    // Single combined query with a short timeout: the old loop waited up to
    // 3s PER selector (9s total), and _waitLoggedIn calls this repeatedly,
    // which made login feel like it "hangs".
    try {
      await this.page
        .locator(INPUT_SELECTORS.join(', '))
        .first()
        .waitFor({ state: 'visible', timeout: 2000 })
      return true
    } catch {
      return false
    }
  }

  async newChat(): Promise<void> {
    const newChatBtn = this.page
      .locator('button, a')
      .filter({ hasText: /new chat|новый чат|новый диалог/i })
      .first()
    try {
      await newChatBtn.click({ timeout: 2000 })
      await this.page.waitForTimeout(1000)
    } catch {
      await this.page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
      await this.page.waitForTimeout(1000)
    }
  }

  async _findVisible(
    selectors: string[],
    timeout = 1000,
  ): Promise<Locator | null> {
    for (const sel of selectors) {
      const loc = this.page.locator(sel).last()
      try {
        await loc.waitFor({ state: 'visible', timeout })
        return loc
      } catch {}
    }
    return null
  }

  async _readLastAnswerText(): Promise<string> {
    // If we managed to intercept the raw answer text over the network
    // (without DeepSeek's render distortions) and it belongs to the current
    // answer — we return it. This protects $, escaped newlines, etc. in arguments.
    if (this._netCapture && this._netCaptureAt >= this._lastSentAt) {
      return this._netCapture
    }
    return await this.page.evaluate((sels: string[]) => {
      // DeepSeek stores the model's reasoning in .ds-think-content blocks.
      // They are NOT the answer and must never be picked up as the answer
      // (otherwise the terminal would show the long reasoning). We also
      // prefer the first (most specific) selector with a hit.
      const inThink = (e: Element | null): boolean => {
        let n: Element | null = e
        while (n) {
          const cls = (n.className || '').toString()
          if (/ds-think-content|thinking-content/i.test(cls)) return true
          n = n.parentElement
        }
        return false
      }
      let el: HTMLElement | null = null
      for (const s of sels) {
        const list = document.querySelectorAll(s)
        if (!list.length) continue
        for (let i = list.length - 1; i >= 0; i--) {
          const cand = list[i] as HTMLElement
          if (inThink(cand)) continue
          el = cand
          break
        }
        if (el) break
      }
      if (!el) return ''
      const out: string = el.innerText || el.textContent || ''
      const NL = String.fromCharCode(10)
      return out.replace(new RegExp(NL + '{3,}', 'g'), NL + NL).trim()
    }, ANSWER_SELECTORS)
  }

  // We read ONLY visible toasts/notifications/errors, not the whole page
  // text. Otherwise we catch "try again later" from service/hidden blocks
  // and go into a false 5-minute rate-limit wait.
  async _readPageText(): Promise<string> {
    return await this.page
      .evaluate(() => {
        const sels = [
          '[role="alert"]',
          '[class*="toast" i]',
          '[class*="notification" i]',
          '[class*="alert" i]',
          '[class*="error" i]',
        ]
        let out = ''
        for (const s of sels) {
          for (const el of Array.from(document.querySelectorAll(s))) {
            const e = el as HTMLElement
            const st = getComputedStyle(e)
            if (st.display === 'none' || st.visibility === 'hidden') continue
            out += ' ' + (e.innerText || '')
          }
        }
        return out
      })
      .catch(() => '')
  }

  async _readLastAnswerTextClean(): Promise<string> {
    const raw = await this._readLastAnswerText().catch(() => '')
    const t = (raw || '').trim()
    if (!t) return ''
    if (STATUS_RE.test(t)) return ''
    return raw
  }

  // Find the Stop button in the DeepSeek UI. We can't rely on the class
  // alone: during generation the send button (the same circle button)
  // changes its icon to a "square" (stop) while keeping the classes.
  async _stopButtonVisible(): Promise<boolean> {
    const explicit = await this._findVisible(STOP_SELECTORS, 250)
    if (explicit) return true
    return await this.page
      .evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll('div[role="button"], button'),
        ) as HTMLElement[]
        for (const b of btns) {
          const cls = (b.className || '').toString()
          if (!/ds-button--(circle|primary|filled)/i.test(cls)) continue
          const label = (
            (b.getAttribute('aria-label') || '') +
            ' ' +
            (b.getAttribute('title') || '') +
            ' ' +
            (b.textContent || '')
          ).toLowerCase()
          if (/stop|останов/.test(label)) return true
          // A square icon = Stop button; an arrow (path without rect) = send.
          const svg = b.querySelector('svg')
          if (svg && svg.querySelector('rect')) return true
        }
        return false
      })
      .catch(() => false)
  }

  async _isGenerating(): Promise<boolean> {
    return await this._stopButtonVisible()
  }

  // DeepSeek exposes two toggle buttons above the input: "Deep thinking"
  // (reasoning) and "Smart search" (web search). Their labels are localized,
  // so we match by a loose regex on the visible text and read the state from
  // aria-pressed. We click ONLY when the state differs, so a send does not
  // flip a toggle the operator set by hand.
  async _setToggle(labelRe: RegExp, want: boolean): Promise<void> {
    try {
      const btns = this.page.locator('.ds-toggle-button')
      const count = await btns.count().catch(() => 0)
      for (let i = 0; i < count; i++) {
        const b = btns.nth(i)
        const txt = ((await b.textContent().catch(() => '')) || '').trim()
        if (!labelRe.test(txt)) continue
        const pressed =
          (await b.getAttribute('aria-pressed').catch(() => null)) === 'true'
        if (pressed !== want) {
          await b.click({ timeout: 2000 }).catch(() => {})
          await this.page.waitForTimeout(150)
        }
        return
      }
    } catch {}
  }

  async _applyToggles(): Promise<void> {
    await this._setToggle(/глубок|deep\s*think/i, this.deepThinking)
    await this._setToggle(/поиск|search/i, this.webSearch)
  }

  async stopGeneration(): Promise<boolean> {
    this._abort = true
    this._stopped = true
    const btn = await this._findVisible(STOP_SELECTORS, 500)
    if (btn) {
      try {
        await btn.click({ timeout: 1500 })
        return true
      } catch {}
    }
    const clicked = await this.page
      .evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll('div[role="button"], button'),
        ) as HTMLElement[]
        for (const b of btns) {
          const cls = (b.className || '').toString()
          if (!/ds-button--(circle|primary|filled)/i.test(cls)) continue
          const svg = b.querySelector('svg')
          if (svg && svg.querySelector('rect')) {
            b.click()
            return true
          }
        }
        return false
      })
      .catch(() => false)
    if (clicked) return true
    try {
      await this.page.keyboard.press('Escape')
      return true
    } catch {}
    return false
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

    while (attempt < this.askRetries) {
      attempt++
      try {
        return await this._askOnce(prompt, { timeout, agent, attachments })
      } catch (e) {
        lastErr = e as Error

        // Rate limit: DeepSeek did not accept the message. We wait a long time
        // and resend into the SAME chat (without newChat — otherwise the
        // context is lost). The waits don't consume the regular ask() attempts.
        if (e instanceof RateLimitError) {
          rateLimitRetries++
          if (rateLimitRetries > this.maxRateLimitRetries) {
            console.error(
              theme.error(
                `✖ DeepSeek не принял сообщение после ${rateLimitRetries} пауз по ${Math.ceil(this.rateLimitWaitMs / 60000)} мин.`,
              ),
            )
            throw e
          }
          console.error(
            theme.warn(
              `⏳ DeepSeek: «слишком часто». Жду ${Math.ceil(this.rateLimitWaitMs / 60000)} мин (${rateLimitRetries}/${this.maxRateLimitRetries}) и повторю...`,
            ),
          )
          // Interruptible: Esc/Ctrl+C must cancel this long wait too,
          // otherwise "stop" stays frozen for up to 5 minutes.
          const aborted = await this._sleepInterruptible(this.rateLimitWaitMs)
          if (aborted) return '(прервано пользователем)'
          continue
        }

        console.error(
          `\n⚠ ask() попытка ${attempt}/${this.askRetries} провалилась: ${(e as Error).message}`,
        )

        if (/closed|crash|Target page|browser/i.test((e as Error).message)) {
          console.error('⚠ перезапускаю браузер...')
          try {
            await this.restart()
            await this.waitForLogin()
          } catch (re) {
            console.error(
              `⚠ не удалось перезапустить: ${(re as Error).message}`,
            )
          }
        }

        if (attempt < this.askRetries) {
          await new Promise((r) => setTimeout(r, 2000 * attempt))
        }
      }
    }

    throw new Error(
      `ask() провалился после ${this.askRetries} попыток: ${lastErr?.message}`,
    )
  }

  async _setInputText(input: Locator, text: string): Promise<void> {
    const tag = await input.evaluate((el) => el.tagName.toLowerCase())
    const isNative = tag === 'textarea' || tag === 'input'

    if (isNative) {
      try {
        await input.fill(text, { timeout: 5000 })
        return
      } catch {}
    }

    await input.click()
    await this.page.keyboard.press('Control+A')
    await this.page.keyboard.press('Delete')

    const ok = await input.evaluate((el, value) => {
      el.focus()
      const dt = new DataTransfer()
      dt.setData('text/plain', value)
      const ev = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })
      el.dispatchEvent(ev)
      return true
    }, text)

    if (!ok) {
      await this.page.keyboard.insertText(text)
    }

    const got = await input.evaluate((el: any) => {
      if (
        el.tagName.toLowerCase() === 'textarea' ||
        el.tagName.toLowerCase() === 'input'
      ) {
        return el.value
      }
      return el.innerText || el.textContent || ''
    })
    const norm = (s: string | null | undefined): string =>
      (s || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u00a0/g, ' ')
        .trim()
    // Verify the WHOLE text landed in the input, not just that it is non-empty.
    // A partial paste (DeepSeek input limits, lost chars) used to pass the
    // old "not empty" check, so a TRUNCATED message was sent, the model
    // replied to the wrong thing (or nothing), and the loop looked stalled.
    if (norm(got) !== norm(text)) {
      await input.click()
      await this.page.keyboard.press("Control+A")
      await this.page.keyboard.press("Delete")
      await this.page.keyboard.insertText(text)
      const got2 = await input.evaluate((el: any) => {
        if (el.tagName.toLowerCase() === "textarea" || el.tagName.toLowerCase() === "input") return el.value
        return el.innerText || el.textContent || ""
      })
      if (norm(got2) !== norm(text)) {
        throw new Error(
          "Не удалось вставить текст в поле ввода DeepSeek целиком (вставлено " + norm(got2).length + " из " + norm(text).length + " символов). Сообщение не отправлено, чтобы не отправить обрезанный текст.",
        )
      }
    }
  }

  // Attach files/images to the chat via the hidden <input type=file> of the
  // DeepSeek upload widget. The element is not visible, so we set the files
  // programmatically (Playwright setInputFiles works on hidden inputs too).
  async _attachFiles(
    files: Array<{ path: string; name: string; mime: string }>,
  ): Promise<void> {
    const bufPayload = []
    for (const f of files) {
      try {
        const buffer = await fs.readFile(f.path)
        bufPayload.push({ name: f.name, mimeType: f.mime, buffer })
      } catch (e) {
        console.error(
          theme.warn(
            '⚠ не удалось прочитать вложение ' +
              f.name +
              ': ' +
              (e as Error).message,
          ),
        )
      }
    }
    if (!bufPayload.length) return

    // Preferred path: click the attach button and let the file chooser event
    // carry the files. This is how a real user attaches a file and it reliably
    // triggers DeepSeek's upload handler.
    const ATTACH_SELECTORS = [
      'div[role="button"][aria-label*="attach" i]',
      'div[role="button"][aria-label*="влож" i]',
      'button[aria-label*="attach" i]',
      'button[aria-label*="влож" i]',
      '[class*="upload"]',
      '[class*="attach"]',
    ]
    for (const sel of ATTACH_SELECTORS) {
      const btn = this.page.locator(sel).last()
      try {
        if ((await btn.count()) === 0) continue
        if (!(await btn.isVisible().catch(() => false))) continue
        const [chooser] = await Promise.all([
          this.page.waitForEvent('filechooser', { timeout: 3000 }),
          btn.click({ timeout: 1500 }),
        ])
        await chooser.setFiles(bufPayload)
        await this.page.waitForTimeout(2500)
        return
      } catch {}
    }

    // Fallback: set the files directly on the hidden <input type=file>.
    const input = this.page.locator('input[type="file"]').first()
    if ((await input.count()) === 0) {
      console.error(
        theme.warn(
          '⚠ не найдено поле загрузки файлов на странице — вложения не прикреплены',
        ),
      )
      return
    }
    try {
      await input.setInputFiles(bufPayload, { timeout: 15_000 })
    } catch (e) {
      console.error(
        theme.warn('⚠ не удалось прикрепить файлы: ' + (e as Error).message),
      )
      return
    }
    // Wait for the upload to finish (the attach preview to appear).
    await this.page.waitForTimeout(2000)
  }

  // Pause between sends. Applied ONLY to agent messages
  // (tool-result, system-prompt) so we don't hit the rate limit.
  // User input is sent without delay.
  //
  // The wait is INTERRUPTIBLE: Esc/Ctrl+C sets _abort, and we check it every
  // 100ms instead of one long page.waitForTimeout(gap). Before, Esc pressed
  // during this pause did nothing to the pause itself — the send was still
  // delayed by the remaining seconds, and the stop request only took effect
  // after the pause. This is the main "Esc does not cancel the pause" bug.
  async _waitForSendSlot(agent: boolean): Promise<void> {
    if (!agent) return
    if (!this._lastSentAt) return
    const gap = this.minSendIntervalMs - (Date.now() - this._lastSentAt)
    if (gap <= 0) return
    // Report the pause to the UI as an ANIMATED status (with the remaining
    // seconds) instead of the old static console line — the dots used to be
    // frozen here, which looked like the spinner had hung. The seconds are
    // refreshed once per second, so the status visibly counts down.
    const report = (leftMs: number) => {
      const secs = Math.max(0, Math.ceil(leftMs / 1000))
      if (this.onSendPause) {
        try {
          this.onSendPause(secs)
        } catch {}
      } else {
        console.error(theme.warn(`⏳ send pause ${secs}s`))
      }
    }
    report(gap)
    await this._sleepInterruptible(gap, report)
  }

  // Sleep in small slices so Esc/Ctrl+C can cancel the wait promptly.
  // Returns true if the sleep was cut short by _abort.
  //
  // onTick (optional) is called about once per second with the remaining time,
  // so the UI can show a live countdown during the pause.
  async _sleepInterruptible(
    ms: number,
    onTick?: (leftMs: number) => void,
  ): Promise<boolean> {
    const step = 100
    let left = ms
    let sinceTick = 0
    while (left > 0) {
      if (this._abort) return true
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

  // DEBUG: append ask() phases to ~/.zames/ask-debug.log so a stall can be
  // diagnosed from the field (what the DOM/network looked like at each step).
  _askDebug(msg: string): void {
    if (!process.env.ZAMES_ASK_DEBUG) return
    try {
      const line = new Date().toISOString() + ' ' + msg + String.fromCharCode(10)
      const dir = path.join(os.homedir(), '.zames')
      void fs.appendFile(path.join(dir, 'ask-debug.log'), line).catch(() => {})
    } catch {}
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
    // We reset the abort flag ONLY at the very start of the send.
    // _stopped (Esc for the WHOLE batch) is NOT reset here: it may have been
    // set while a previous send was waiting in the pause. If it is set, the
    // user asked to stop and we must not start a new generation at all.
    this._abort = false
    if (this._stopped) return '(прервано пользователем)'
    const input = await this._findVisible(INPUT_SELECTORS, 10_000)
    if (!input) {
      throw new Error(
        'Не найдено поле ввода. Запустите /debug-dom и поправьте INPUT_SELECTORS.',
      )
    }

    const beforeText = await this._readLastAnswerTextClean().catch(() => '')
    this._askDebug('SEND agent=' + agent + ' len=' + prompt.length + ' beforeLen=' + beforeText.length + ' beforeHead=' + JSON.stringify(beforeText.slice(0, 60)))

    await this._waitForSendSlot(agent)
    // Esc/Ctrl+C pressed during the pause — do not send anything.
    if (this._abort) return '(прервано пользователем)'
    // The pause is over and we are really about to type/send: only NOW start
    // the "working" indicator. The spinner used to be started by the caller
    // BEFORE ask(), so it ran for the whole throttle pause and chat-opening
    // phase with no generation in flight.
    if (this.onSendStart) {
      try {
        this.onSendStart()
      } catch {}
    }
    this._netCapture = ''
    this._netCaptureAt = 0

    // Align the DeepSeek chat toggles (deep thinking / web search) with the
    // configured state BEFORE typing. Doing it here (after the send-pause) it
    // does not flip toggles for a generation that is not going to happen.
    await this._applyToggles()

    // Attach files/images FIRST (before the text): the DeepSeek upload widget
    // shows them above the input, and only then the message can be sent.
    if (attachments.length) {
      await this._attachFiles(attachments)
    }

    await this._setInputText(input, prompt)
    await this.page.waitForTimeout(50)

    let sent = false
    for (const sel of SEND_SELECTORS) {
      const btn = this.page.locator(sel).last()
      try {
        if ((await btn.count()) === 0) continue
        if (!(await btn.isVisible().catch(() => false))) continue
        await btn.click({ timeout: 1500 })
        sent = true
        break
      } catch {}
    }
    if (!sent) {
      await this.page.keyboard.press('Enter')
    }
    this._lastSentAt = Date.now()
    this._askDebug('SENT at=' + this._lastSentAt)

    // Wait for the start: either Stop appeared, or the answer text changed,
    // or the total amount of text on the page grew. In parallel we catch
    // the rate-limit toast (only toasts, not the whole body).
    const startDeadline = Date.now() + 30_000
    const startBodyLen = await this.page
      .evaluate(() => document.body.innerText.length)
      .catch(() => 0)
    let started = false
    // A stale/echo answer (the model repeats the previous text, or the answer
    // legitimately equals it) does NOT change `cur`. In that case the old loop
    // either threw "did not start" after 15s or hung until the full timeout —
    // the operator saw the agent "stop after a tool call". We now also accept
    // the answer when the generation has clearly SETTLED: no Stop button and
    // the text has been stable for a couple of ticks.
    let settledTicks = 0
    let lastStartCur = ''
    while (Date.now() < startDeadline) {
      if (this._abort) return '(прервано пользователем)'
      const pageText = await this._readPageText()
      if (isRateLimitText(pageText)) {
        throw new RateLimitError(pageText.slice(0, 300))
      }
      if (isServerBusyText(pageText)) {
        throw new ServerBusyError(pageText.slice(0, 300))
      }
      const cur = await this._readLastAnswerTextClean().catch(() => '')
      const bodyLen = await this.page
        .evaluate(() => document.body.innerText.length)
        .catch(() => 0)
      // A NEW answer is the only reliable sign that the message was actually
      // sent: the text on the page must differ from what was there before the
      // send, OR the page must have grown. The Stop-button heuristic
      // (_isGenerating) is NOT used here: right after a tool result the stop
      // button may briefly linger from the previous generation, which used to
      // make us think the new answer had started when in fact nothing was sent
      // — and then the agent silently "stopped".
      const changed = cur && normText(cur) !== normText(beforeText)
      // Network capture with a fresh timestamp is the STRONGEST proof that a
      // new answer started: it is the raw SSE body for the CURRENT send. Right
      // after a tool result the DOM may still show the previous answer, so
      // 'changed' can stay false for a while — without this check ask() used
      // to hang until the full timeout and the agent appeared to "stop".
      const netStarted =
        !!this._netCapture && this._netCaptureAt >= this._lastSentAt
      if (changed || netStarted || bodyLen > startBodyLen) {
        started = true
        this._askDebug('STARTED changed=' + changed + ' netStarted=' + netStarted + ' bodyGrew=' + (bodyLen > startBodyLen))
        break
      }
      // Fallback for an echo: the text equals beforeText, so it is the OLD
      // answer still on screen, NOT a new one. We must NOT return it (that
      // made the loop re-run the previous tool call). We only return when the
      // text DIFFERS from beforeText and has settled, or when a fresh network
      // capture proves a new answer exists. If it stays equal, keep waiting.
      const notGenerating = !(await this._isGenerating())
      const differs = !!cur && normText(cur) !== normText(beforeText)
      if (differs && cur === lastStartCur && notGenerating) {
        settledTicks++
        if (settledTicks >= 2) {
          this._askDebug('SETTLED-differs return len=' + cur.length)
          return cur
        }
      } else {
        settledTicks = 0
      }
      lastStartCur = cur
      this._askDebug('START-loop curLen=' + cur.length + ' changed=' + changed + ' netStarted=' + netStarted + ' bodyLen=' + bodyLen + ' settled=' + settledTicks + ' generating=' + notGenerating)
      await this.page.waitForTimeout(300)
    }
    if (!started) {
// Last chance: accept the text only when it DIFFERS from beforeText
// (otherwise it is the old answer on screen) or a fresh network capture
// proves a new answer. Returning an equal text made the loop re-run the
// previous tool call.
const cur = await this._readLastAnswerTextClean().catch(() => '')
const fresh = !!this._netCapture && this._netCaptureAt >= this._lastSentAt
if (cur && cur.trim() && normText(cur) !== normText(beforeText) && !(await this._isGenerating())) {
return cur
}
if (fresh) {
return this._netCapture
}
      // The send did not start generation within 15s. The most common cause is
      // that the message did not actually go out (Enter lost, button not
      // clicked). Instead of throwing (which made ask() retry for minutes and
      // looked like a stall), press Enter once more and give it another
      // window. Only if that also fails do we throw.
      this._askDebug('START-failed, resending')
      await this.page.keyboard.press('Enter')
      this._lastSentAt = Date.now()
      const retryDeadline = Date.now() + 20_000
      while (Date.now() < retryDeadline) {
        if (this._abort) return '(прервано пользователем)'
        const cur2 = await this._readLastAnswerTextClean().catch(() => '')
        const net2 =
          !!this._netCapture && this._netCaptureAt >= this._lastSentAt
        const grew2 =
          (await this.page
            .evaluate(() => document.body.innerText.length)
            .catch(() => 0)) > startBodyLen
        if (
          net2 ||
          grew2 ||
          (!!cur2 && normText(cur2) !== normText(beforeText))
        ) {
          started = true
          this._askDebug('STARTED-after-resend')
          break
        }
        await this.page.waitForTimeout(300)
      }
    }
    if (!started) {
      throw new Error(
        'Ответ не начал генерироваться за 35с даже после повторной отправки. ' +
          'Проверьте чат DeepSeek вручную.',
      )
    }

    // Wait until the answer stops changing. We check the "not generating"
    // condition via text growth, NOT via _isGenerating().
    // In parallel we catch the rate-limit toast if it pops up during
    // generation (we read only toasts, so there are no false positives).
    const deadline = Date.now() + timeout
    let last = ''
    let stable = 0
    let tick = 0
    while (Date.now() < deadline) {
      if (this._abort) {
        return last || '(прервано пользователем)'
      }
      // We check the limit toast not every tick but about once per 5 ticks,
      // so we don't poke the DOM unnecessarily.
      if (tick++ % 5 === 0) {
        const pageText = await this._readPageText()
        if (isRateLimitText(pageText)) {
          throw new RateLimitError(pageText.slice(0, 300))
 if (isServerBusyText(pageText)) { throw new ServerBusyError(pageText.slice(0, 300)) }
        }
      }
      const netFresh =
        !!this._netCapture && this._netCaptureAt >= this._lastSentAt
      const cur = await this._readLastAnswerTextClean().catch(() => '')
      // Ignore an "answer" that is identical to what was on the page BEFORE we
      // sent the message: that is the previous answer, not a new one. Returning
      // it would make the agent re-process the old tool call (or silently
      // stop). We keep waiting instead. A fresh network capture is exempt: it
      // belongs to the CURRENT send even if the DOM still shows the old text.
      const isNew =
        !!cur &&
        (netFresh || normText(cur) !== normText(beforeText))
      // An echo/stale answer equals beforeText, so isNew stays false and the
      // old loop waited until the full timeout — the "agent stopped after a
      // tool call" hang. If generation has clearly ENDED (no Stop button) and
      // the text is stable, accept it (even when it repeats the previous one).
      const sameAsBefore =
        !!cur && !isNew && normText(cur) === normText(beforeText)
      if (isNew && cur === last) {
        stable++
        // `stabilityChecks` / `stabilityDelayMs` are the real knobs here.
        // They used to be dead config (hardcoded 2 checks with an 800ms tick),
        // so the FIN-loop always cost ~1.6s per answer. Defaults are now
        // 2 checks x 400ms (~0.8s saved per turn) and the values are honored.
        if (stable >= Math.max(1, this.stabilityChecks - 1)) {
          if (isNew || !(await this._isGenerating())) {
            this._askDebug('RETURN stable curLen=' + cur.length)
            return cur
          }
        }
      } else {
        stable = 0
      }
      if (isNew) last = cur
      this._askDebug('FIN-loop isNew=' + isNew + ' sameAsBefore=' + sameAsBefore + ' stable=' + stable + ' curLen=' + cur.length + ' lastLen=' + last.length + ' netFresh=' + netFresh)
      await this.page.waitForTimeout(Math.max(0, this.stabilityDelayMs))
    }

    if (last && (normText(last) !== normText(beforeText) || this._netCapture)) {
      this._askDebug('RETURN last len=' + last.length)
      return last
    }
    // No fallback on a text equal to beforeText: returning it would re-run
    // the previous tool call. Only a fresh network capture is accepted below.
    if (this._netCapture && this._netCaptureAt >= this._lastSentAt) {
      return this._netCapture
    }
    this._askDebug('THROW no-new-answer lastLen=' + last.length + ' beforeLen=' + beforeText.length)
    throw new Error(
      'Новый ответ не получен (на странице остался прежний текст). ' +
        'Возможно, сообщение не отправилось.',
    )
  }

  async dumpDom(
    filePath: string,
  ): Promise<{ file: string; selectors: unknown }> {
    if (!this.page) throw new Error('браузер не запущен')
    const html = await this.page.content()
    await fs.writeFile(filePath, html, 'utf-8')

    const report = await this.page.evaluate(
      (sels: { answers: string[]; stops: string[]; inputs: string[] }) => {
        const result: {
          answers: Record<string, number>
          stops: Record<string, number>
          inputs: Record<string, number>
        } = { answers: {}, stops: {}, inputs: {} }
        for (const s of sels.answers) {
          result.answers[s] = document.querySelectorAll(s).length
        }
        for (const s of sels.stops) {
          result.stops[s] = document.querySelectorAll(s).length
        }
        for (const s of sels.inputs) {
          result.inputs[s] = document.querySelectorAll(s).length
        }
        return result
      },
      {
        answers: ANSWER_SELECTORS,
        stops: STOP_SELECTORS,
        inputs: INPUT_SELECTORS,
      },
    )

    return { file: filePath, selectors: report }
  }

  async _ensureSidebarOpen(): Promise<void> {
    const toggles = [
      'button[aria-label*="sidebar" i]',
      'button[aria-label*="история" i]',
      'button[aria-label*="history" i]',
      'button[class*="sidebar-toggle"]',
      'button[class*="sidebarToggle"]',
    ]
    for (const sel of toggles) {
      try {
        const btn = this.page.locator(sel).first()
        if ((await btn.count()) === 0) continue
        if (!(await btn.isVisible().catch(() => false))) continue
        await btn.click({ timeout: 1500 })
        await this.page.waitForTimeout(500)
        return
      } catch {}
    }
  }

  async listChats(limit = 30): Promise<ChatInfo[]> {
    await this._ensureSidebarOpen()
    return await this.page.evaluate((lim) => {
      const out = []
      const seen = new Set()
      const anchors = document.querySelectorAll('a[href*="/chat/"]')
      for (const a of anchors) {
        const href = a.getAttribute('href') || ''
        const m =
          href.match(/\/chat\/s\/([a-zA-Z0-9_-]+)/) ||
          href.match(/\/a\/chat\/s\/([a-zA-Z0-9_-]+)/)
        if (!m) continue
        const id = m[1]
        if (seen.has(id)) continue
        seen.add(id)

        const titleEl = a.querySelector('[class*="title"], [class*="text"]')
        let title = (titleEl ? titleEl.textContent : a.textContent) || ''
        title = title.trim().replace(/\s+/g, ' ')
        if (!title) title = '(без названия)'

        out.push({ id, title, href })
        if (out.length >= lim) break
      }
      return out
    }, limit)
  }

  async openChat(id: string): Promise<boolean> {
    const candidates = [`a[href$="/chat/s/${id}"]`, `a[href*="${id}"]`]
    for (const sel of candidates) {
      try {
        const loc = this.page.locator(sel).first()
        if ((await loc.count()) === 0) continue
        await loc.click({ timeout: 3000 })
        await this.page.waitForTimeout(1500)
        return true
      } catch {}
    }

    try {
      await this.page.goto(`https://chat.deepseek.com/a/chat/s/${id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      })
      await this.page.waitForTimeout(1500)
      return true
    } catch (e) {
      throw new Error(`Не удалось открыть чат ${id}: ${(e as Error).message}`)
    }
  }

  async getCurrentChatId(): Promise<string | null> {
    try {
      const url = this.page.url()
      const m = url.match(/\/chat\/s\/([a-zA-Z0-9_-]+)/)
      if (m) return m[1]
      return this._netChatId
    } catch {
      return this._netChatId
    }
  }

  async close(): Promise<void> {
    try {
      if (this.context) await this.context.close()
    } catch {}
    await killStaleChrome()
  }
}
