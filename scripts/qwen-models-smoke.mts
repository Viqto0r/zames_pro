// Qwen model-switching self-smoke: launch a REAL isolated QwenBrowser, list
// the model catalogue, then SWITCH to several models and ask a question with
// each — the operator explicitly asked that model switching be exercised.
//
// Isolation mirrors qwen-smoke.mts: a throwaway HOME + a read-only COPY of the
// real qwen-profile (the live profile is never opened).
//
// Usage: npx tsx scripts/qwen-models-smoke.mts [--headed] [--all]

import fs from 'fs'
import path from 'path'
import os from 'os'

const HEADED = process.argv.includes('--headed')
const ALL = process.argv.includes('--all')
const REAL_HOME = os.homedir()
const PROFILE_SRC = path.join(REAL_HOME, '.zames', 'qwen-profile')

if (!process.env.ZAMES_QWEN_MODELS_HOME) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-qwen-models-'))
  process.env.HOME = tmp
  process.env.ZAMES_QWEN_MODELS_HOME = tmp
  fs.mkdirSync(path.join(tmp, '.zames'), { recursive: true })
  fs.mkdirSync(path.join(tmp, '.cache'), { recursive: true })
  const realCfg = path.join(REAL_HOME, '.zames', 'config.json')
  if (fs.existsSync(realCfg)) {
    fs.copyFileSync(realCfg, path.join(tmp, '.zames', 'config.json'))
  }
  const realPw = path.join(REAL_HOME, '.cache', 'ms-playwright')
  if (fs.existsSync(realPw)) {
    fs.symlinkSync(realPw, path.join(tmp, '.cache', 'ms-playwright'))
  }
  if (fs.existsSync(PROFILE_SRC)) {
    fs.cpSync(PROFILE_SRC, path.join(tmp, '.zames', 'qwen-profile'), {
      recursive: true,
      filter: (src) => !/^Singleton/.test(path.basename(src)),
    })
  }
}

const { QwenBrowser } = await import('../src/qwen-browser.ts')
const { loadConfig } = await import('../src/config.ts')
const cfg = loadConfig()

const results: Array<{ name: string; ok: boolean; note?: string }> = []
const record = (name: string, ok: boolean, note?: string): void => {
  results.push({ name, ok, note })
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : ''))
}

const browser = new QwenBrowser({
  headless: !HEADED,
  debug: false,
  channel: cfg.browserChannel,
  auth: cfg.browser.auth,
  locale: 'ru',
  minSendIntervalMs: 0,
  answerTimeoutMs: 180000,
  webSearch: false,
  deepThinking: false,
})
browser.onNotice = (t: string) => console.log('  [notice] ' + t)

async function main(): Promise<void> {
  await browser.launch()
  const timedOut = await Promise.race([
    browser.waitForLogin().then(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(true), 60000)),
  ])
  if (timedOut) {
    record('login', false, 'timed out')
    await browser.close().catch(() => {})
    process.exit(2)
  }
  record('login', true)

  const models = await browser.listModels()
  record(
    'listModels',
    models.length > 0,
    'n=' + models.length + ' ' + models.map((m) => m.id).join(','),
  )

  // Switch through a few models and ask with each. Prefer distinct vendors so
  // the dropdown selection really changes the backend.
  const wanted = ALL ? models : models.slice(0, 3)
  for (const m of wanted) {
    try {
      await browser.newChat()
      browser.model = m.id
      const ans = await browser.ask('Reply with exactly: OK', { agent: true })
      const ok = /OK/i.test(ans)
      record('model:' + m.id, ok, ok ? '' : 'got: ' + ans.slice(0, 60))
    } catch (e) {
      record('model:' + m.id, false, (e as Error).message)
    }
  }

  await browser.close().catch(() => {})
  const failed = results.filter((r) => !r.ok)
  console.log(
    '\nqwen-models-smoke: ' +
      (results.length - failed.length) +
      '/' +
      results.length +
      ' passed',
  )
  if (!process.env.ZAMES_QWEN_MODELS_KEEP) {
    fs.rmSync(process.env.ZAMES_QWEN_MODELS_HOME as string, {
      recursive: true,
      force: true,
    })
  }
  process.exit(failed.length ? 1 : 0)
}

void main()
