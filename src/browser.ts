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

const USER_DATA_DIR = path.join(os.homedir(), '.zames', 'profile')
const CHAT_URL = 'https://chat.deepseek.com/'

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

export function isRateLimitText(text: string): boolean {
  return RATE_LIMIT_RE.test(String(text || ''))
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

  constructor({
    headless = false,
    debug = false,
    channel = 'chrome',
    answerTimeoutMs = 180000,
    askRetries = 3,
    stabilityChecks = 3,
    stabilityDelayMs = 1000,
    minSendIntervalMs = 15000,
    rateLimitWaitMs = 300000,
    maxRateLimitRetries = 6,
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
    this._lastSentAt = 0
    this._abort = false
    this._stopped = false
    this._netCapture = ''
    this._netCaptureAt = 0
    this._netChatId = null
    this._netSniff = []
    this._netSniffLimit = 5
    this._netHookInstalled = false
  }

  async launch(): Promise<void> {
    await killStaleChrome()
    if (await profileLooksLocked()) {
      if (this.debug) console.error('profile: удаляю Singleton-файлы')
      await cleanSingletonFiles()
    }
    await this._launchOnce()
  }

  async _launchOnce(): Promise<void> {
    const options: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: this.headless,
      slowMo: 30,
      args: ['--disable-blink-features=AutomationControlled'],
    }
    if (this.channel) options.channel = this.channel

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
    const loggedIn = await this.isLoggedIn()
    if (loggedIn) return

    console.log('\n🔐 Залогиньтесь в DeepSeek в открытом браузере.')
    console.log('   После входа нажмите Enter в терминале...\n')

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
  }

  async isLoggedIn(): Promise<boolean> {
    for (const sel of INPUT_SELECTORS) {
      try {
        await this.page.locator(sel).first().waitFor({
          state: 'visible',
          timeout: 3000,
        })
        return true
      } catch {}
    }
    return false
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
      let el: HTMLElement | null = null
      for (const s of sels) {
        const list = document.querySelectorAll(s)
        if (list.length) el = list[list.length - 1] as HTMLElement
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
          await this.page.waitForTimeout(this.rateLimitWaitMs)
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
    if (!norm(got)) {
      await input.click()
      await this.page.keyboard.insertText(text)
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
  async _waitForSendSlot(agent: boolean): Promise<void> {
    if (!agent) return
    if (!this._lastSentAt) return
    const gap = this.minSendIntervalMs - (Date.now() - this._lastSentAt)
    if (gap <= 0) return
    console.error(
      theme.warn(`⏳ пауза ${Math.ceil(gap / 1000)}с перед отправкой`),
    )
    await this.page.waitForTimeout(gap)
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
    this._abort = false
    const input = await this._findVisible(INPUT_SELECTORS, 10_000)
    if (!input) {
      throw new Error(
        'Не найдено поле ввода. Запустите /debug-dom и поправьте INPUT_SELECTORS.',
      )
    }

    const beforeText = await this._readLastAnswerTextClean().catch(() => '')

    await this._waitForSendSlot(agent)
    this._netCapture = ''
    this._netCaptureAt = 0

    // Attach files/images FIRST (before the text): the DeepSeek upload widget
    // shows them above the input, and only then the message can be sent.
    if (attachments.length) {
      await this._attachFiles(attachments)
    }

    await this._setInputText(input, prompt)
    await this.page.waitForTimeout(200)

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

    // Wait for the start: either Stop appeared, or the answer text changed,
    // or the total amount of text on the page grew. In parallel we catch
    // the rate-limit toast (only toasts, not the whole body).
    const startDeadline = Date.now() + 15_000
    const startBodyLen = await this.page
      .evaluate(() => document.body.innerText.length)
      .catch(() => 0)
    let started = false
    while (Date.now() < startDeadline) {
      if (this._abort) return '(прервано пользователем)'
      const pageText = await this._readPageText()
      if (isRateLimitText(pageText)) {
        throw new RateLimitError(pageText.slice(0, 300))
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
      if (changed || bodyLen > startBodyLen) {
        started = true
        break
      }
      await this.page.waitForTimeout(300)
    }
    if (!started) {
      // We NO LONGER check the limit over the whole page text — that caused
      // false positives and 5-minute waits. We just report that
      // generation did not start.
      throw new Error(
        'Ответ не начал генерироваться за 15с. Возможно, сообщение не отправилось.',
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
        }
      }
      const cur = await this._readLastAnswerTextClean().catch(() => '')
      // Ignore an "answer" that is identical to what was on the page BEFORE we
      // sent the message: that is the previous answer, not a new one. Returning
      // it would make the agent re-process the old tool call (or silently
      // stop). We keep waiting instead.
      const isNew = cur && normText(cur) !== normText(beforeText)
      if (isNew && cur === last) {
        stable++
        if (stable >= 2) return cur
      } else {
        stable = 0
      }
      if (isNew) last = cur
      await this.page.waitForTimeout(800)
    }

    if (last && normText(last) !== normText(beforeText)) return last
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
