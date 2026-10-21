// GLM (chat.z.ai) self-smoke: a REAL isolated GlmBrowser instance against the
// live site, to catch integration regressions (login, send, answer) that unit
// tests cannot.
//
// Isolation: HOME is pointed at a throwaway dir BEFORE importing any project
// module (they compute ~/.zames paths at load). The real GLM profile
// (~/.zames/glm-profile) is COPIED read-only into the temp HOME so the browser
// starts already signed in; the live profile is NEVER opened. The Playwright
// browser cache is symlinked read-only. Nothing in the operator's ~/.zames is
// written. ZAMES_NONINTERACTIVE_LOGIN=1 is set so a cold login fails FAST
// (z.ai shows an Aliyun captcha a headless browser cannot pass).
//
// Usage:  npx tsx scripts/glm-smoke.mts [--headed] [--no-reuse-profile]
// Exit code 0 = all scenarios passed; 2 = login failed (could not start).

import fs from 'fs'
import path from 'path'
import os from 'os'

const HEADED = process.argv.includes('--headed')
const REUSE_PROFILE = !process.argv.includes('--no-reuse-profile')
const REAL_HOME = os.homedir()
const PROFILE_SRC = path.join(REAL_HOME, '.zames', 'glm-profile')

if (!process.env.ZAMES_GLM_SMOKE_HOME) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-glm-smoke-'))
  process.env.HOME = tmp
  process.env.ZAMES_GLM_SMOKE_HOME = tmp
  process.env.ZAMES_NONINTERACTIVE_LOGIN = '1'
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
    fs.cpSync(PROFILE_SRC, path.join(tmp, '.zames', 'glm-profile'), {
      recursive: true,
      filter: (src) => !/^Singleton/.test(path.basename(src)),
    })
  }
}
const SMOKE_HOME = process.env.ZAMES_GLM_SMOKE_HOME as string

// --- project modules (dynamic: they read HOME at import) --------------------
const { GlmBrowser } = await import('../src/glm-browser.ts')
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

const browser = new GlmBrowser({
  headless: !HEADED,
  debug: process.env.ZAMES_GLM_SMOKE_DEBUG === '1',
  channel: cfg.browserChannel,
  auth: cfg.glm.auth,
  locale: 'ru',
  minSendIntervalMs: 0,
  answerTimeoutMs: 300000,
  webSearch: false,
  deepThinking: false,
})
browser.onNotice = (t: string) => console.log('  [notice] ' + t)

function cleanupSmokeHome(): void {
  if (process.env.ZAMES_GLM_SMOKE_KEEP) {
    console.log('kept HOME: ' + SMOKE_HOME)
    return
  }
  try {
    fs.rmSync(SMOKE_HOME, { recursive: true, force: true })
  } catch {}
}
process.on('SIGINT', () => {
  cleanupSmokeHome()
  process.exit(130)
})

async function main() {
  console.log(
    'glm-smoke: HOME=' +
      SMOKE_HOME +
      ' headed=' +
      HEADED +
      ' reuse-profile=' +
      REUSE_PROFILE,
  )
  await browser.launch()

  // Bound the login wait: a cold profile is gated by an Aliyun captcha, so a
  // failure must be FAST (exit code 2) instead of hanging until a timeout.
  let logged = false
  try {
    const loginPromise = browser.waitForLogin()
    const timedOut = await Promise.race([
      loginPromise.then(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(true), 45000)),
    ])
    if (timedOut) record('login', false, 'timed out after 45s')
    else logged = true
  } catch (e) {
    // A non-interactive run with no saved session throws LoginRequiredError
    // FAST (that is the contract): report it and exit with code 2.
    record('login', false, (e as Error).message)
  }
  if (!logged) {
    logged = await browser
      .probeLogin()
      .then((r) => r === 'in')
      .catch(() => false)
    if (logged) record('login', true, 'session already active')
    else loginFailed = true
  }

  if (!loginFailed) {
    // ONE chat for the whole run: open it, then send the real system-prompt
    // into it. Sending the prompt first and calling newChat() after would
    // discard it and every tool scenario would run against a bare model.
    try {
      await browser.newChat()
      const { buildSystemPrompt } = await import('../src/system-prompt.ts')
      const { createTools } = await import('../src/tools.ts')
      const tools = createTools(SMOKE_HOME, {})
      const sys = buildSystemPrompt({
        workdir: SMOKE_HOME,
        tools,
        locale: 'ru',
        provider: 'glm',
      })
      await browser.ask(sys, { agent: false })
    } catch (e) {
      record('systemPrompt', false, (e as Error).message)
    }

    try {
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

    try {
      const ans = await browser.ask('Reply with exactly: PONG2', {
        agent: true,
      })
      const ok = /PONG2/i.test(ans)
      record('ask:second-send', ok, ok ? '' : 'got: ' + ans.slice(0, 80))
    } catch (e) {
      record('ask:second-send', false, (e as Error).message)
    }

    try {
      const models = await browser.listModels()
      record('listModels', models.length > 0, 'n=' + models.length)
    } catch (e) {
      record('listModels', false, (e as Error).message)
    }

    const usage = browser.getLastTokenUsage()
    record('tokenUsage', usage !== null, 'usage=' + String(usage))

    // A REAL tool call through the zames protocol: the site's own agent
    // runtime is neutralised (preview_mode/general_agent), so the model must
    // emit the call as JSON to US. Asking it to "print the JSON" would test
    // the wrong thing (it refuses to print tool syntax as prose).
    try {
      const { parseToolCall } = await import('../src/answer-parse.ts')
      const ans = await browser.ask(
        'Use the Read tool to read package.json, then reply with EXACTLY one ' +
          'JSON tool-call object and nothing else: ' +
          '{"tool":"Read","args":{"path":"package.json"}}',
        { agent: true },
      )
      const parsed = parseToolCall(ans)
      const call = Array.isArray(parsed) ? parsed[0] : parsed
      const ok = !!call && call.tool === 'Read'
      record('toolCall', ok, ok ? '' : 'got: ' + ans.slice(0, 140))
    } catch (e) {
      record('toolCall', false, (e as Error).message)
    }

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

    // Attachments: the upload control fires a real filechooser. A signed-in
    // session uploads; a guest cannot, which is a site restriction (a SKIP).
    try {
      const note = path.join(SMOKE_HOME, 'glm-smoke-note.txt')
      fs.writeFileSync(note, 'The secret word is KIWI')
      const failed = await browser._attachFiles([
        { path: note, name: 'glm-smoke-note.txt', mime: 'text/plain' },
      ])
      const attached = failed.length === 0
      if (attached) record('attachment', true, '')
      else record('attachment', false, JSON.stringify(failed))
    } catch (e) {
      record('attachment', false, (e as Error).message)
    }
  }

  await browser.close().catch(() => {})

  const failed = results.filter((r) => !r.ok)
  console.log(
    '\nglm-smoke: ' +
      (results.length - failed.length) +
      '/' +
      results.length +
      ' passed',
  )
  cleanupSmokeHome()
  process.exit(loginFailed ? 2 : failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('glm-smoke crashed:', (e as Error).message)
  cleanupSmokeHome()
  process.exit(1)
})
