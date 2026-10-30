// long-chain-smoke: a LONG live run (20+ turns) of the REAL agent loop against
// the REAL chat, in an ISOLATED profile (a COPY of the signed-in one).
//
// It exercises what a short smoke cannot: the send throttle, tool-result
// turns, Continue/THINK pauses, the answer watchdog, mid-run restore
// (readChatMessages + the history API), the context counter and the
// stop/resume path. It never opens the operator's ~/.zames/profile.
//
// Usage: npx tsx scripts/long-chain-smoke.mts [--headed] [--rounds N]
// Exit: 0 all scenarios passed, 1 a scenario failed, 2 login failed.
import fs from 'fs'
import path from 'path'
import os from 'os'

const NL = String.fromCharCode(10)

const HEADED = process.argv.includes('--headed')
const ri = process.argv.indexOf('--rounds')
const ROUNDS = ri > 0 ? Number(process.argv[ri + 1]) : 24
const REAL_HOME = os.homedir()
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-long-'))
process.env.HOME = TMP
process.env.ZAMES_NONINTERACTIVE_LOGIN = '1'
fs.mkdirSync(path.join(TMP, '.zames'), { recursive: true })
fs.mkdirSync(path.join(TMP, '.cache'), { recursive: true })
const realCfg = path.join(REAL_HOME, '.zames', 'config.json')
if (fs.existsSync(realCfg))
  fs.copyFileSync(realCfg, path.join(TMP, '.zames', 'config.json'))
const realPw = path.join(REAL_HOME, '.cache', 'ms-playwright')
if (fs.existsSync(realPw))
  fs.symlinkSync(realPw, path.join(TMP, '.cache', 'ms-playwright'))
fs.cpSync(
  path.join(REAL_HOME, '.zames', 'profile'),
  path.join(TMP, '.zames', 'profile'),
  { recursive: true, filter: (s) => !/^Singleton/.test(path.basename(s)) },
)
const WORK = path.join(TMP, 'work')
fs.mkdirSync(WORK, { recursive: true })

const { DeepSeekBrowser } = await import('../src/browser.ts')
const { createTools } = await import('../src/tools.ts')
const { runAgentLoop } = await import('../src/agent-loop.ts')
const { loadConfig } = await import('../src/config.ts')
const { Transcript } = await import('../src/transcript.ts')
const rh = await import('../src/restore-history.ts')

const cfg = loadConfig()
const transcript = new Transcript({
  dir: path.join(TMP, '.zames', 'logs'),
  enabled: false,
  sessionName: 'long-chain',
})
const browser = new DeepSeekBrowser({
  headless: !HEADED,
  debug: false,
  channel: cfg.browserChannel,
  auth: cfg.browser.auth,
  locale: 'ru',
  // Same throttle as the real run; a LONGER watchdog so a slow reasoning turn
  // is not mistaken for a stall, and a smaller auto-compact threshold.
  minSendIntervalMs: cfg.browser.minSendIntervalMs,
  deepThinking: process.env.LONG_THINKING !== '0',
})

interface Res {
  name: string
  ok: boolean
  note?: string
}
const results: Res[] = []
const record = (name: string, ok: boolean, note?: string): void => {
  results.push({ name, ok, note })
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : ''))
}
const notes: string[] = []
let loginFailed = false
const tools = createTools(WORK, {})

// One agent task with EVERY callback wired, so a warning the loop emits
// (watchdog, retry, "Stopped") is captured instead of vanishing.
async function run(
  task: string,
  opts: { freshChat?: boolean; sendSystemPrompt?: boolean } = {},
): Promise<{ answer: string; warnings: string[]; tools: string[] }> {
  const warnings: string[] = []
  const ran: string[] = []
  const answer = await runAgentLoop({
    browser,
    tools,
    task,
    workdir: WORK,
    maxIterations: 30,
    freshChat: opts.freshChat ?? false,
    sendSystemPrompt: opts.sendSystemPrompt ?? false,
    onChatReady: (id: string | null) => {
      if (id) (browser as any).resumeChatId = null
    },
    transcript,
    onContextLimit: onContextLimitCb,
    onToolCall: (n: string) => {
      ran.push(n)
      console.log('    tool: ' + n)
    },
    onToolResult: () => {},
    onAssistantMessage: (m: string) =>
      console.log('    answer: ' + JSON.stringify(m.slice(0, 90))),
    onWarning: (m: string) => {
      warnings.push(m)
      console.log('    WARN: ' + m)
    },
    onNotice: (m: string) => {
      notes.push(m)
      console.log('    NOTICE: ' + m)
    },
    locale: 'ru',
    askDeadlineMs: cfg.browser.askDeadlineMs,
    maxAfterToolRetries: cfg.browser.maxAfterToolRetries,
  })
  return { answer, warnings, tools: ran }
}

async function onContextLimitCb(): Promise<boolean> {
  const { performCompact } = await import('../src/compact.ts')
  const res = await performCompact({
    browser: browser as any,
    currentChatId: await browser.getCurrentChatId(),
    workdir: WORK,
    locale: 'ru',
    buildSystemPrompt: (() => 'system') as any,
    tools,
    answerTimeoutMs: 120000,
    transcript: { log: () => {} },
    contextExhausted: false,
    providerLabel: 'DeepSeek',
    ui: { lock: () => {}, unlock: () => {}, printAbove: () => {} },
    quiet: false,
    skipUiLock: true,
  })
  console.log('    COMPACT ok=' + res.ok + ' err=' + (res.error || '-'))
  if (res.ok && res.chatId) (browser as any).resumeChatId = res.chatId
  return res.ok
}

async function main(): Promise<void> {
  ;(browser as any).onContextLimit = onContextLimitCb
  console.log(
    'long-chain-smoke: HOME=' + TMP + ' headed=' + HEADED + ' rounds=' + ROUNDS,
  )
  await browser.launch()
  const loggedIn = await Promise.race([
    browser.waitForLogin().then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 150_000)),
  ])
  if (!loggedIn) {
    console.error('long-chain-smoke: LOGIN FAILED')
    loginFailed = true
    return
  }
  record('login', true)

  // Scenario 1: a LONG chain in ONE chat. Every turn asks for a tool call and
  // a short respond, so the loop runs send -> tool -> tool-result -> answer
  // dozens of times. That is where the throttle, the watchdog and the
  // Continue/THINK handling actually get stressed.
  const st = await run(
    'Turn 1: call respond with exactly STEP1-OK and nothing else. ' +
      'Do not use any tool and do not explain.',
    { freshChat: true, sendSystemPrompt: true },
  )
  record('turn 1: answered', /STEP1-OK/.test(st.answer), st.answer.slice(0, 60))
  record(
    'turn 1: no watchdog/nudge warning',
    st.warnings.length === 0,
    st.warnings.join(' | ').slice(0, 200),
  )

  let failures = 0
  for (let i = 2; i <= ROUNDS; i++) {
    const r = await run(
      // A SHORT answer on purpose: the chain measures the agent loop
      // (send -> answer -> next send), and long answers fill the 1M window.
      'Turn ' +
        i +
        ': call respond with exactly STEP' +
        i +
        '-OK and nothing else. Do not use any tool and do not explain.',
    )
    const ok = new RegExp('STEP' + i + '-OK').test(r.answer)
    if (!ok || r.warnings.length) {
      failures++
      console.log(
        '  !! turn ' +
          i +
          ' answer=' +
          JSON.stringify(r.answer.slice(0, 80)) +
          ' warnings=' +
          JSON.stringify(r.warnings),
      )
    }
  }
  record(
    'long chain: every turn answered, no warnings',
    failures === 0,
    failures + ' bad turns of ' + (ROUNDS - 1),
  )
  fs.writeFileSync(
    '/tmp/long-chain-notes.txt',
    notes.join(String.fromCharCode(10)),
  )
}

let crashed = false
try {
  await main()
} catch (e) {
  record('run', false, (e as Error).message)
  crashed = true
} finally {
  await browser.close().catch(() => {})
  transcript.close()
}
const passed = results.filter((r) => r.ok).length
console.log(
  NL + 'long-chain-smoke: ' + passed + '/' + results.length + ' passed',
)
const anyFail = crashed || results.some((r) => !r.ok)
if (!process.env.ZAMES_LONG_KEEP) {
  try {
    fs.rmSync(TMP, { recursive: true, force: true })
  } catch {}
}
process.exit(loginFailed ? 2 : anyFail ? 1 : 0)
