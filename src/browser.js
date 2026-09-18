import { chromium } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { execSync } from 'child_process'

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

export class DeepSeekBrowser {
  constructor({
    headless = false,
    debug = false,
    channel = 'chrome',
    answerTimeoutMs = 180000,
    askRetries = 3,
    stabilityChecks = 3,
    stabilityDelayMs = 1000,
  } = {}) {
    this.headless = headless
    this.debug = debug
    this.channel = channel
    this.answerTimeoutMs = answerTimeoutMs
    this.askRetries = askRetries
    this.stabilityChecks = stabilityChecks
    this.stabilityDelayMs = stabilityDelayMs
    this.context = null
    this.page = null
  }

  async launch() {
    await killStaleChrome()
    if (await profileLooksLocked()) {
      if (this.debug) console.error('profile: удаляю Singleton-файлы')
      await cleanSingletonFiles()
    }
    await this._launchOnce()
  }

  async _launchOnce() {
    const options = {
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
          e.message,
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
    await this.page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
    return this
  }

  async restart() {
    try {
      if (this.context) await this.context.close()
    } catch {}
    await this.launch()
  }

  async waitForLogin() {
    const loggedIn = await this.isLoggedIn()
    if (loggedIn) return

    console.log('\n🔐 Залогиньтесь в DeepSeek в открытом браузере.')
    console.log('   После входа нажмите Enter в терминале...\n')

    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    await new Promise((resolve) => {
      rl.question('', () => {
        rl.close()
        resolve()
      })
    })
  }

  async isLoggedIn() {
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

  async newChat() {
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

  async _findVisible(selectors, timeout = 1000) {
    for (const sel of selectors) {
      const loc = this.page.locator(sel).last()
      try {
        await loc.waitFor({ state: 'visible', timeout })
        return loc
      } catch {}
    }
    return null
  }

  async _readLastAnswerText() {
    return await this.page.evaluate((sels) => {
      let el = null
      for (const s of sels) {
        const list = document.querySelectorAll(s)
        if (list.length) el = list[list.length - 1]
      }
      if (!el) return ''

      const clone = el.cloneNode(true)

      Array.from(clone.querySelectorAll('pre')).forEach((pre) => {
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

      Array.from(clone.querySelectorAll('code')).forEach((c) => {
        const replacement = document.createTextNode(
          '`' + (c.textContent || '') + '`',
        )
        if (c.parentNode) c.parentNode.replaceChild(replacement, c)
      })

      return clone.textContent || ''
    }, ANSWER_SELECTORS)
  }

  async _readLastAnswerTextClean() {
    const raw = await this._readLastAnswerText().catch(() => '')
    const t = (raw || '').trim()
    if (!t) return ''
    // Отсекаем служебные статусы интерфейса (Reading..., Думаю...).
    if (STATUS_RE.test(t)) return ''
    return raw
  }

  async _isGenerating() {
    const stop = await this._findVisible(STOP_SELECTORS, 300)
    return !!stop
  }

  async ask(prompt, { timeout = this.answerTimeoutMs } = {}) {
    let lastErr = null

    for (let attempt = 1; attempt <= this.askRetries; attempt++) {
      try {
        return await this._askOnce(prompt, { timeout })
      } catch (e) {
        lastErr = e
        console.error(
          `\n⚠ ask() попытка ${attempt}/${this.askRetries} провалилась: ${e.message}`,
        )

        if (/closed|crash|Target page|browser/i.test(e.message)) {
          console.error('⚠ перезапускаю браузер...')
          try {
            await this.restart()
            await this.waitForLogin()
          } catch (re) {
            console.error(`⚠ не удалось перезапустить: ${re.message}`)
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

  async _askOnce(prompt, { timeout }) {
    const input = await this._findVisible(INPUT_SELECTORS, 10_000)
    if (!input) {
      throw new Error(
        'Не найдено поле ввода. Запустите /debug-dom и поправьте INPUT_SELECTORS.',
      )
    }

    const beforeText = await this._readLastAnswerTextClean().catch(() => '')

    await input.click()
    try {
      await input.fill(prompt, { timeout: 5000 })
    } catch {
      // contenteditable / [role=textbox] не поддерживает fill() — печатаем
      // текст в уже сфокусированное поле, не задевая раскладку.
      await this.page.keyboard.insertText(prompt)
    }
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
    while (Date.now() < deadline) {
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

    if (last) return last
    throw new Error('Таймаут ожидания ответа. Попробуйте /debug-dom.')
  }

  async dumpDom(filePath) {
    if (!this.page) throw new Error('браузер не запущен')
    const html = await this.page.content()
    await fs.writeFile(filePath, html, 'utf-8')

    const report = await this.page.evaluate(
      (sels) => {
        const result = { answers: {}, stops: {}, inputs: {} }
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

  async _ensureSidebarOpen() {
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

  async listChats(limit = 30) {
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

  async openChat(id) {
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
      throw new Error(`Не удалось открыть чат ${id}: ${e.message}`)
    }
  }

  async getCurrentChatId() {
    try {
      const url = this.page.url()
      const m = url.match(/\/chat\/s\/([a-zA-Z0-9_-]+)/)
      return m ? m[1] : null
    } catch {
      return null
    }
  }

  async close() {
    try {
      if (this.context) await this.context.close()
    } catch {}
    await killStaleChrome()
  }
}
