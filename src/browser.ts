import { chromium, type BrowserContext, type Page, type Locator } from 'playwright'
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
  'div[class*="ds-markdown"]',
  'div[class*="markdown"]',
]

const STOP_SELECTORS = [
  'button:has-text("Stop")',
  'button:has-text("Остановить")',
  'button[aria-label*="Stop" i]',
]

// Служебные статусы интерфейса DeepSeek, которые НЕ являются ответом модели.
// Иначе агент принимает статус (Reading...) за ответ и ломает разбор.
const STATUS_RE = /^(reading|thinking|searching|analyzing|generating|stop|остановить|читаю|думаю|поиск|анализ)[\s.…]*$/i


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
  _lastSentAt: number
  _abort: boolean
  context!: BrowserContext
  page!: Page
  // Перехват сетевых ответов DeepSeek: там лежит СЫРОЙ текст ответа модели
  // (markdown без рендер-искажений LaTeX/автолинков). Собираем его по мере
  // стрима, чтобы _readLastAnswerText отдавал исходник, а не DOM-рендер.
  _netCapture: string
  _netCaptureAt: number
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
  }: DeepSeekBrowserOptions = {}) {
    this.headless = headless
    this.debug = debug
    this.channel = channel
    this.answerTimeoutMs = answerTimeoutMs
    this.askRetries = askRetries
    this.stabilityChecks = stabilityChecks
    this.stabilityDelayMs = stabilityDelayMs
    // Минимальный интервал между отправками в чат: DeepSeek ограничивает
    // частоту («Messages too frequent. Try again later.»).
    this.minSendIntervalMs = minSendIntervalMs
    this._lastSentAt = 0
    this._abort = false
    this._netCapture = ''
    this._netCaptureAt = 0
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

  // Перехват сетевых ответов DeepSeek. Ответ модели приходит стримом
  // (SSE/JSON) — это СЫРОЙ markdown без рендер-искажений. Накапливаем его,
  // чтобы чтение ответа отдавало исходник, а не DOM-рендер.
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

  async _findVisible(selectors: string[], timeout = 1000): Promise<Locator | null> {
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
    // Если удалось перехватить сырой текст ответа по сети (без рендер-
    // искажений DeepSeek) и он относится к текущему ответу — отдаём его.
    // Это защищает $, экранированные переводы строк и т.п. в аргументах.
    if (this._netCapture && this._netCaptureAt >= this._lastSentAt) {
      return this._netCapture
    }
    return await this.page.evaluate((sels: string[]) => {
      let el = null
      for (const s of sels) {
        const list = document.querySelectorAll(s)
        if (list.length) el = list[list.length - 1]
      }
      if (!el) return ''

      const clone = el.cloneNode(true) as Element

      Array.from(clone.querySelectorAll("pre")).forEach((pre: Element) => {
        const codeEl = pre.querySelector('code')
        const source = codeEl || pre
        const text = (source.textContent || '').replace(/\n$/, '')
        const langMatch = (source.className || '').match(/language-([\w-]+)/)
        const lang = langMatch ? langMatch[1] : ''
        const replacement = document.createTextNode(
          '```' + lang + '\n' + text + '\n```',
        )
        if (pre.parentNode) pre.parentNode.replaceChild(replacement, pre)
      })

      Array.from(clone.querySelectorAll("code")).forEach((c: Element) => {
        const replacement = document.createTextNode(
          '`' + (c.textContent || '') + '`',
        )
        if (c.parentNode) c.parentNode.replaceChild(replacement, c)
      })

      // textContent склеивает блоки без переводов строк, из-за чего
      // Markdown-рендер получает одну длинную строку. Обходим DOM сами и
      // расставляем переводы строк / маркеры Markdown по блочным элементам.
      const NL = String.fromCharCode(10)
      const BULLET = String.fromCharCode(45) + ' ' // '- '

      function domToMarkdown(node: any): string {
        if (node.nodeType === 3) return node.textContent || ''
        if (node.nodeType !== 1) return ''
        const tag = node.tagName.toLowerCase()

        if (tag === 'br') return NL

        const inner: string = Array.from(node.childNodes)
          .map(domToMarkdown)
          .join('')

        const STAR = String.fromCharCode(42) // '*'
        if (tag === 'strong' || tag === 'b') return STAR + STAR + inner + STAR + STAR
        if (tag === 'em' || tag === 'i') return STAR + inner + STAR
        if (tag === 'del' || tag === 's') return '~~' + inner + '~~'
        if (tag === 'a') {
          const href = node.getAttribute('href') || ''
          return href ? '[' + inner + '](' + href + ')' : inner
        }
        if (/^h[1-6]$/.test(tag)) {
          const level = Number(tag[1])
          const hashes = '#'.repeat(level)
          return NL + NL + hashes + ' ' + inner.trim() + NL + NL
        }
        if (tag === 'li') {
          const text = inner.trim().replace(new RegExp(NL + '+', 'g'), ' ')
          return BULLET + text + NL
        }
        if (tag === 'ul' || tag === 'ol' || tag === 'blockquote') {
          return NL + inner + NL
        }
        if (
          tag === 'p' ||
          tag === 'div' ||
          tag === 'section' ||
          tag === 'article' ||
          tag === 'tr' ||
          tag === 'table'
        ) {
          const text = inner.trim()
          return text ? NL + NL + text : ''
        }
        return inner
      }

      const out = domToMarkdown(clone)
      // Схлопываем тройные+ переводы строк до двойных (разделитель блоков).
      return out.replace(new RegExp(NL + '{3,}', 'g'), NL + NL).trim()
    }, ANSWER_SELECTORS)
  }

  async _readLastAnswerTextClean(): Promise<string> {
    const raw = await this._readLastAnswerText().catch(() => '')
    const t = (raw || '').trim()
    if (!t) return ''
    // Отсекаем служебные статусы интерфейса (Reading..., Думаю...).
    if (STATUS_RE.test(t)) return ''
    return raw
  }

  async _isGenerating(): Promise<boolean> {
    const stop = await this._findVisible(STOP_SELECTORS, 300)
    return !!stop
  }

  // Прервать текущую генерацию: нажать Stop в интерфейсе.
  // Используется при нажатии Esc пользователем.
  async stopGeneration(): Promise<boolean> {
    this._abort = true
    const btn = await this._findVisible(STOP_SELECTORS, 500)
    if (btn) {
      try {
        await btn.click({ timeout: 1000 })
        return true
      } catch {}
    }
    return false
  }

  async ask(prompt: string, { timeout = this.answerTimeoutMs }: { timeout?: number } = {}): Promise<string> {
    let lastErr = null

    for (let attempt = 1; attempt <= this.askRetries; attempt++) {
      try {
        return await this._askOnce(prompt, { timeout })
      } catch (e) {
        lastErr = e
        console.error(
          `\n⚠ ask() попытка ${attempt}/${this.askRetries} провалилась: ${(e as Error).message}`,
        )

        if (/closed|crash|Target page|browser/i.test((e as Error).message)) {
          console.error('⚠ перезапускаю браузер...')
          try {
            await this.restart()
            await this.waitForLogin()
          } catch (re) {
            console.error(`⚠ не удалось перезапустить: ${(re as Error).message}`)
          }
        }

        if (attempt < this.askRetries) {
          await new Promise((r) => setTimeout(r, 2000 * attempt))
        }
      }
    }

    throw new Error(
      `ask() провалился после ${this.askRetries} попыток: ${(lastErr as Error | null)?.message}`,
    )
  }

  // Вставка текста в поле ввода.
  //
  // fill()/insertText() ломаются на многострочном тексте в contenteditable-
  // редакторах (ProseMirror/Lexical/...): символ перевода строки там
  // трактуется как Enter, и в поле остаётся только первая строка. Поэтому
  // для contenteditable и [role=textbox] эмулируем paste-событие с полным
  // текстом — то же, что делает Shift+Insert. Для нативных textarea/input
  // перевод строки работает и так.
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
    // Выделяем всё содержимое, чтобы вставка заменила его целиком.
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
      // Если обработчик не отменил вставку и поле осталось пустым —
      // пробуем через insertText вручную (fallback ниже).
      return true
    }, text)

    if (!ok) {
      await this.page.keyboard.insertText(text)
    }

    // Проверяем, что текст реально попал в поле. Если редактор проигнорировал
    // paste — падаем на insertText.
    const got = await input.evaluate((el: any) => {
      if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
        return el.value
      }
      return el.innerText || el.textContent || ''
    })
    const norm = (s: string | null | undefined): string =>
      (s || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim()
    if (!norm(got)) {
      await input.click()
      await this.page.keyboard.insertText(text)
    }
  }

  // Ждём, пока с прошлой отправки пройдёт minSendIntervalMs. Защита от
  // «Messages too frequent. Try again later.» на [chat.deepseek.com](https://chat.deepseek.com/).
  async _waitForSendSlot(): Promise<void> {
    if (!this._lastSentAt) return // первая отправка — пауза не нужна
    const gap = this.minSendIntervalMs - (Date.now() - this._lastSentAt)
    if (gap <= 0) return
    console.error(
      theme.warn(
        `⏳ пауза ${Math.ceil(gap / 1000)}с перед отправкой (лимит частоты DeepSeek)...`,
      ),
    )
    await this.page.waitForTimeout(gap)
  }

  async _askOnce(prompt: string, { timeout }: { timeout: number }): Promise<string> {
    const input = await this._findVisible(INPUT_SELECTORS, 10_000)
    if (!input) {
      throw new Error(
        'Не найдено поле ввода. Запустите /debug-dom и поправьте INPUT_SELECTORS.',
      )
    }

    const beforeText = await this._readLastAnswerTextClean().catch(() => '')

    await this._waitForSendSlot()
    // Сбрасываем прошлый перехват: ответ на это сообщение ещё придёт.
    this._netCapture = ''
    this._netCaptureAt = 0
    await this._setInputText(input, prompt)
    await this.page.waitForTimeout(200)

    const sendBtn = this.page
      .locator('button')
      .filter({ hasText: /send|отправить/i })
      .first()
    try {
      await sendBtn.click({ timeout: 1500 })
    } catch {
      await this.page.keyboard.press('Enter')
    }
    this._lastSentAt = Date.now()

    const startDeadline = Date.now() + 15_000
    let started = false
    while (Date.now() < startDeadline) {
      const gen = await this._isGenerating()
      const cur = await this._readLastAnswerTextClean().catch(() => '')
      if (gen || (cur && cur !== beforeText)) {
        started = true
        break
      }
      await this.page.waitForTimeout(300)
    }
    if (!started) {
      throw new Error(
        'Ответ не начал генерироваться за 15с. Возможно, сообщение не отправилось.',
      )
    }

    const deadline = Date.now() + timeout
    let last = ''
    let stable = 0
    this._abort = false
    while (Date.now() < deadline) {
      if (this._abort) {
        // Пользователь нажал Esc — вернём то, что успело сгенерироваться.
        return last || '(прервано пользователем)'
      }
      const gen = await this._isGenerating()
      const cur = await this._readLastAnswerTextClean().catch(() => '')
      if (cur && cur === last && !gen) {
        stable++
        if (stable >= 2) return cur
      } else {
        stable = 0
      }
      last = cur
      await this.page.waitForTimeout(800)
    }

    if (last) {
      if (this.debug) {
        const src =
          this._netCapture && this._netCaptureAt >= this._lastSentAt
            ? 'NET'
            : 'DOM'
        console.error('[browser] ответ прочитан из: ' + src)
        if (this._netSniff.length) {
          console.error(
            '[browser] перехваченные ответы: ' +
              this._netSniff.map((s) => s.url).join(', '),
          )
        }
      }
      return last
    }
    throw new Error('Таймаут ожидания ответа. Попробуйте /debug-dom.')
  }

  async dumpDom(filePath: string): Promise<{ file: string; selectors: unknown }> {
    if (!this.page) throw new Error('браузер не запущен')
    const html = await this.page.content()
    await fs.writeFile(filePath, html, 'utf-8')

    const report = await this.page.evaluate(
      (sels: { answers: string[]; stops: string[]; inputs: string[] }) => {
        const result: { answers: Record<string, number>; stops: Record<string, number>; inputs: Record<string, number> } = { answers: {}, stops: {}, inputs: {} }
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

  // ---------- список чатов ----------

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
      return m ? m[1] : null
    } catch {
      return null
    }
  }

  async close(): Promise<void> {
    try {
      if (this.context) await this.context.close()
    } catch {}
    await killStaleChrome()
  }
}
