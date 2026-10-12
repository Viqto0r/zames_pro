// Qwen (chat.qwen.ai) self-smoke: a REAL isolated QwenBrowser instance against
// the live site, to catch integration regressions (login, send, answer) that
// unit tests cannot.
//
// Isolation: HOME is pointed at a throwaway dir BEFORE importing any project
// module (they compute ~/.zames paths at load). The real Qwen profile
// (~/.zames/qwen-profile) is COPIED read-only into the temp HOME so the
// browser starts already signed in; the live profile is NEVER opened. The
// Playwright browser cache is symlinked read-only. Nothing in the operator's
// ~/.zames is written.
//
// Usage:  npx tsx scripts/qwen-smoke.mts [--headed] [--no-reuse-profile]
// Exit code 0 = all scenarios passed; 2 = login failed (could not start).

import fs from 'fs'
import path from 'path'
import os from 'os'

const HEADED = process.argv.includes('--headed')
const REUSE_PROFILE = !process.argv.includes('--no-reuse-profile')
const REAL_HOME = os.homedir()
const PROFILE_SRC = path.join(REAL_HOME, '.zames', 'qwen-profile')

if (!process.env.ZAMES_QWEN_SMOKE_HOME) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-qwen-smoke-'))
  process.env.HOME = tmp
  process.env.ZAMES_QWEN_SMOKE_HOME = tmp
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
  if (REUSE_PROFILE && fs.existsSync(PROFILE_SRC)) {
    fs.cpSync(PROFILE_SRC, path.join(tmp, '.zames', 'qwen-profile'), {
      recursive: true,
      filter: (src) => !/^Singleton/.test(path.basename(src)),
    })
  }
}
const SMOKE_HOME = process.env.ZAMES_QWEN_SMOKE_HOME as string

// --- project modules (dynamic: they read HOME at import) --------------------
const { QwenBrowser } = await import('../src/qwen-browser.ts')
const { loadConfig } = await import('../src/config.ts')

const cfg = loadConfig()

interface SmokeResult {
  name: string
  ok: boolean
  note?: string
}
const results: SmokeResult[] = []
let loginFailed = false
const record = (name: string, ok: boolean, note?: string): void => {
  results.push({ name, ok, note })
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : ''))
}

const browser = new QwenBrowser({
  headless: !HEADED,
  debug: process.env.ZAMES_QWEN_SMOKE_DEBUG === '1',
  channel: cfg.browserChannel,
  auth: cfg.browser.auth,
  locale: 'ru',
  minSendIntervalMs: 0,
  answerTimeoutMs: 180000,
  webSearch: false,
  deepThinking: false,
})
browser.onNotice = (t: string) => console.log('  [notice] ' + t)

async function main() {
  console.log(
    'qwen-smoke: HOME=' +
      SMOKE_HOME +
      ' headed=' +
      HEADED +
      ' reuse-profile=' +
      REUSE_PROFILE,
  )
  await browser.launch()

  // Bound the login wait so a cold/expired session fails fast with a clear
  // hint instead of hanging until the caller's tool timeout.
  const loginPromise = browser.waitForLogin()
  const timedOut = await Promise.race([
    loginPromise.then(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(true), 60000)),
  ])
  if (timedOut) {
    loginFailed = true
    record('login', false, 'timed out after 60s')
  } else {
    const logged = await browser.isLoggedIn().catch(() => false)
    record('login', logged, logged ? '' : 'not signed in (guest)')
    if (!logged) loginFailed = true
  }

  if (!loginFailed) {
    // 1) new chat + a SIMPLE ask that needs no tools: the model must answer.
    try {
      await browser.newChat()
      const id = await browser.getCurrentChatId()
      record('newChat', true, 'id=' + (id || '(none)'))
    } catch (e) {
      record('newChat', false, (e as Error).message)
    }

    try {
      const ans = await browser.ask('Reply with exactly: PONG', {
        agent: true,
      })
      const ok = /PONG/i.test(ans)
      record('ask:simple', ok, ok ? '' : 'got: ' + ans.slice(0, 80))
    } catch (e) {
      record('ask:simple', false, (e as Error).message)
    }

    // 2) a second send right after the first: guards the send-verify path (the
    //    "text entered but send button not pressed" regression).
    try {
      const ans = await browser.ask('Reply with exactly: PONG2', {
        agent: true,
      })
      const ok = /PONG2/i.test(ans)
      record('ask:second-send', ok, ok ? '' : 'got: ' + ans.slice(0, 80))
    } catch (e) {
      record('ask:second-send', false, (e as Error).message)
    }

    // 3) model catalogue + token usage (best-effort, non-fatal).
    try {
      const models = await browser.listModels()
      record('listModels', models.length > 0, 'n=' + models.length)
    } catch (e) {
      record('listModels', false, (e as Error).message)
    }

    const usage = browser.getLastTokenUsage()
    record('tokenUsage', usage !== null, 'usage=' + String(usage))

    // 4) tool-call emission: the agent-loop depends on the model returning a
    //    parseable JSON tool call. Ask for one explicitly and check the PARSER
    //    (not the model's prose).
    try {
      const { parseToolCall } = await import('../src/answer-parse.ts')
      const ans = await browser.ask(
        'Call the Read tool for the file package.json. Reply with EXACTLY one ' +
          'JSON tool-call object and nothing else: ' +
          '{"tool":"Read","args":{"path":"..."}}',
        { agent: true },
      )
      const parsed = parseToolCall(ans)
      const call = Array.isArray(parsed) ? parsed[0] : parsed
      const ok = !!call && call.tool === 'Read'
      record('toolCall', ok, ok ? '' : 'got: ' + ans.slice(0, 100))
    } catch (e) {
      record('toolCall', false, (e as Error).message)
    }

    // History restore: after the sends above the chat must have messages.
    try {
      const id = await browser.getCurrentChatId()
      const msgs = id ? await browser.fetchChatMessages(id) : []
      record(
        'history',
        msgs.length > 0,
        'id=' + (id || '-') + ' msgs=' + msgs.length,
      )
    } catch (e) {
      record('history', false, (e as Error).message)
    }

    // Attachments: a SIGNED-IN session uploads a file; a GUEST cannot, so a
    // guest failure is reported as a SKIP (not a failure) — the guest limit is
    // a site restriction, not a regression.
    try {
      const tmpFile = path.join(SMOKE_HOME, 'zames-smoke-note.txt')
      fs.writeFileSync(tmpFile, 'The secret word is BANANA')
      const failed = await browser._attachFiles([
        { path: tmpFile, name: 'zames-smoke-note.txt', mime: 'text/plain' },
      ])
      const attached = failed.length === 0
      const isGuest = !(await browser.isLoggedIn().catch(() => false))
      if (attached) record('attachments', true, '')
      else if (isGuest)
        record('attachments', true, 'skipped (guest cannot upload)')
      else record('attachments', false, JSON.stringify(failed))
    } catch (e) {
      record('attachments', false, (e as Error).message)
    }
  }

  await browser.close().catch(() => {})

  const failed = results.filter((r) => !r.ok)
  console.log(
    '\nqwen-smoke: ' +
      (results.length - failed.length) +
      '/' +
      results.length +
      ' passed',
  )
  if (!process.env.ZAMES_QWEN_SMOKE_KEEP) {
    fs.rmSync(SMOKE_HOME, { recursive: true, force: true })
  } else {
    console.log('kept HOME: ' + SMOKE_HOME)
  }
  process.exit(loginFailed ? 2 : failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('qwen-smoke crashed:', (e as Error).message)
  process.exit(1)
})
