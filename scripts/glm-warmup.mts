// Warm-up for the GLM profile: opens z.ai in a REAL visible browser window with
// the GLM profile, so a HUMAN can pass the Aliyun slider captcha once. The
// profile is persistent (~/.zames/glm-profile), so after this the smoke and the
// agent run without a captcha.
//
// This script is deliberately tiny: it does NOT talk to the model and does not
// send anything. It only opens the chat page and waits until the operator says
// the captcha is passed (Enter in this terminal) or the process is killed.
//
// Usage:  npx tsx scripts/glm-warmup.mts
//         (Ctrl+C when done)

import fs from 'fs'
import path from 'path'
import os from 'os'

const PROFILE = path.join(os.homedir(), '.zames', 'glm-profile')
fs.mkdirSync(PROFILE, { recursive: true })

const { chromium } = await import('playwright')

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
})
const pages = ctx.pages()
const page = pages[0] || (await ctx.newPage())
await page.goto('https://chat.z.ai/', { waitUntil: 'domcontentloaded' })

console.log('')
console.log('  Открыто окно z.ai (chat.z.ai) с профилем ' + PROFILE)
console.log('  1. Войди в аккаунт, если ещё не вошёл.')
console.log(
  '  2. Отправь любое сообщение (например «hi») и пройди капчу-слайдер.',
)
console.log(
  '  3. Когда сообщение РЕАЛЬНО отправлено и ответ пришёл — нажми Ctrl+C.',
)
console.log('')
console.log('  Профиль сохраняется автоматически; этот процесс можно убить.')

// Keep the browser open until the operator stops the process.
await new Promise<void>((resolve) => {
  process.on('SIGINT', () => resolve())
  process.on('SIGTERM', () => resolve())
})
await ctx.close().catch(() => {})
console.log('glm-warmup: closed')
