import { chromium } from 'playwright'
import path from 'path'
import os from 'os'

const USER_DATA_DIR = path.join(os.homedir(), '.ds-agent', 'profile')
const CHAT_URL = 'https://chat.deepseek.com/'

const BROWSER_CHANNEL = 'chrome'

const INPUT_SELECTORS = [
  'textarea',
  'div[contenteditable="true"]',
  '[role="textbox"]',
]

const ANSWER_SELECTORS = [
  'div[class*="ds-markdown"]',
  'div[class*="markdown"]',
  '[class*="message"]',
]

const STOP_SELECTORS = [
  'button:has-text("Stop")',
  'button:has-text("Остановить")',
  'button[aria-label*="Stop" i]',
]

export class DeepSeekBrowser {
  constructor({ headless = false, debug = false } = {}) {
    this.headless = headless
    this.debug = debug
    this.context = null
    this.page = null
  }

  async launch() {
    const options = {
      headless: this.headless,
      slowMo: 30,
      args: ['--disable-blink-features=AutomationControlled'],
    }

    if (BROWSER_CHANNEL) options.channel = BROWSER_CHANNEL

    this.context = await chromium.launchPersistentContext(
      USER_DATA_DIR,
      options,
    )

    this.page = this.context.pages()[0] || (await this.context.newPage())
    await this.page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
    return this
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

  // Читает текст последнего ответа, восстанавливая markdown-элементы
  // обратно в их исходное строковое представление:
  //   <pre><code>...</code></pre>  →  ```lang\n...\n```
  //   <code>...</code>             →  `...`
  // Это критично для кода, где нужны template literals и бэктики.
  async _readLastAnswerText() {
    return await this.page.evaluate((sels) => {
      let el = null
      for (const s of sels) {
        const list = document.querySelectorAll(s)
        if (list.length) el = list[list.length - 1]
      }
      if (!el) return ''

      const clone = el.cloneNode(true)

      // Блоки кода: <pre><code class="language-x">...</code></pre>
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

      // Инлайн-код: <code>...</code>
      Array.from(clone.querySelectorAll('code')).forEach((c) => {
        const replacement = document.createTextNode(
          '`' + (c.textContent || '') + '`',
        )
        if (c.parentNode) c.parentNode.replaceChild(replacement, c)
      })

      return clone.textContent || ''
    }, ANSWER_SELECTORS)
  }

  async ask(prompt, { timeout = 180_000 } = {}) {
    const input = await this._findVisible(INPUT_SELECTORS, 10_000)
    if (!input) {
      throw new Error(
        'Не найдено поле ввода. Запустите с --calibrate и поправьте INPUT_SELECTORS.',
      )
    }

    await input.click()
    await input.fill(prompt)
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

    await this.page.waitForTimeout(800)
    const stop = await this._findVisible(STOP_SELECTORS, 2000)
    if (stop) {
      try {
        await stop.waitFor({ state: 'hidden', timeout })
      } catch {}
    }

    const deadline = Date.now() + timeout
    let lastText = ''
    let stableCount = 0

    while (Date.now() < deadline) {
      let text = ''
      try {
        text = await this._readLastAnswerText()
      } catch {}

      if (text && text === lastText) {
        stableCount++
        if (stableCount >= 3) return text
      } else {
        stableCount = 0
        lastText = text
      }

      await this.page.waitForTimeout(1000)
    }

    return lastText
  }

  async close() {
    if (this.context) await this.context.close()
  }
}
