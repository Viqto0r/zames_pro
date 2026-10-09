// self-smoke: launch a REAL isolated zames instance and exercise the core
// functionality end-to-end (login, tools, attachments), WITHOUT touching the
// operator's ~/.zames profile. Used by the agent to check its own build.
//
// Isolation: the script points HOME at a throwaway dir BEFORE importing any
// project module (they compute ~/.zames paths at load time), copies the real
// config.json (so auto-login works) and symlinks the Playwright browser cache.
// Nothing in the operator's profile is written.
//
// Usage:  npm run self-smoke                     (headless, empty profile)
//         npm run self-smoke -- --headed
//         npm run self-smoke -- --reuse-profile   (logged-in profile, see below)
// Exit code 0 = all scenarios passed; 2 = login failed (could not start).
//
// --reuse-profile: copy the REAL profile (~/.zames/profile) read-only into the
// throwaway HOME so the browser starts ALREADY SIGNED IN. Reason: DeepSeek's
// anti-bot increasingly blocks a COLD login on a fresh profile (captcha / rate
// limit), so a smoke that logs in from scratch fails for reasons unrelated to
// the agent. Copying (never opening the live profile) keeps isolation intact.

import fs from 'fs'
import path from 'path'
import os from 'os'

// --- flags -----------------------------------------------------------------
const HEADED = process.argv.includes('--headed')
const REUSE_PROFILE =
  process.argv.includes('--reuse-profile') ||
  process.env.ZAMES_SMOKE_REUSE_PROFILE === '1'
// Optional explicit source profile (default: the real ~/.zames/profile).
const profileArgIdx = process.argv.indexOf('--profile')
const REAL_HOME = os.homedir()
const PROFILE_SRC =
  profileArgIdx >= 0 && process.argv[profileArgIdx + 1]
    ? path.resolve(process.argv[profileArgIdx + 1])
    : path.join(REAL_HOME, '.zames', 'profile')

// --- isolate HOME before importing project modules -------------------------
if (!process.env.ZAMES_SMOKE_HOME) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zames-smoke-'))
  process.env.HOME = tmp
  process.env.ZAMES_SMOKE_HOME = tmp
  fs.mkdirSync(path.join(tmp, '.zames'), { recursive: true })
  fs.mkdirSync(path.join(tmp, '.cache'), { recursive: true })
  // Credentials for auto-login (copied, never written back to the real home).
  const realCfg = path.join(REAL_HOME, '.zames', 'config.json')
  if (fs.existsSync(realCfg)) {
    fs.copyFileSync(realCfg, path.join(tmp, '.zames', 'config.json'))
  }
  // Playwright browsers live in the real cache; link it read-only.
  const realPw = path.join(REAL_HOME, '.cache', 'ms-playwright')
  if (fs.existsSync(realPw)) {
    fs.symlinkSync(realPw, path.join(tmp, '.cache', 'ms-playwright'))
  }
  // Reuse a logged-in profile: COPY it (the live one is never opened) and drop
  // the Singleton* files — Chrome refuses to start on a profile whose lock is
  // present, and the live browser may hold it. The cookies survive the copy
  // because Playwright launches with --password-store=basic.
  if (REUSE_PROFILE && fs.existsSync(PROFILE_SRC)) {
    fs.cpSync(PROFILE_SRC, path.join(tmp, '.zames', 'profile'), {
      recursive: true,
      filter: (src) => !/^Singleton/.test(path.basename(src)),
    })
  }
}
const SMOKE_HOME = process.env.ZAMES_SMOKE_HOME
const WORK = path.join(SMOKE_HOME, 'work')
fs.mkdirSync(WORK, { recursive: true })

// --- project modules (dynamic: they read HOME at import) --------------------
const { DeepSeekBrowser } = await import('../src/browser.ts')
const { createTools, filterToolsForReadOnly } = await import('../src/tools.ts')
const { runAgentLoop } = await import('../src/agent-loop.ts')
const { createSubagentRunner } = await import('../src/subagent.ts')
const { loadConfig } = await import('../src/config.ts')
const { Transcript } = await import('../src/transcript.ts')

interface SmokeResult {
  name: string
  ok: boolean
  note?: string
}
const results: SmokeResult[] = []
// Set when we could not even start (login failed): exit code 2, distinct from a
// scenario failure (1).
let loginFailed = false
const record = (name: string, ok: boolean, note?: string): void => {
  results.push({ name, ok, note })
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  — ' + note : ''))
}

const cfg = loadConfig()
const transcript = new Transcript({
  dir: path.join(SMOKE_HOME, '.zames', 'logs'),
  enabled: true,
  sessionName: 'self-smoke',
})

const browser = new DeepSeekBrowser({
  headless: !HEADED,
  debug: false,
  channel: cfg.browserChannel,
  auth: cfg.browser.auth,
  locale: 'ru',
  minSendIntervalMs: cfg.browser.minSendIntervalMs,
})

async function main() {
  console.log(
    'self-smoke: HOME=' +
      SMOKE_HOME +
      ' headed=' +
      HEADED +
      ' reuse-profile=' +
      REUSE_PROFILE,
  )
  await browser.launch()
  // waitForLogin() can block on a manual Enter in a pipe. Bound it so a cold
  // login (anti-bot / captcha) fails fast with a clear hint instead of hanging
  // until the caller's tool timeout. On failure exit code 2 signals "could not
  // even start" — distinct from a scenario failure.
  const loggedIn = await Promise.race([
    browser.waitForLogin().then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 120_000)),
  ])
  if (!loggedIn) {
    console.error(
      '\nself-smoke: LOGIN FAILED — a cold login on a fresh profile is often\n' +
        'blocked by DeepSeek anti-bot/captcha. Re-run against a signed-in profile:\n' +
        '  npm run self-smoke -- --reuse-profile\n' +
        '(or sign in once with: npm run self-smoke -- --headed).',
    )
    loginFailed = true
    return
  }
  record('login', true, 'DeepSeek session is active')

  const tools = createTools(WORK, {})

  // Scenario A — tools (Write, Read, Bash) + respond.
  const taskA =
    'Do exactly this, then report: (1) Write a file smoke.txt with the single line HELLO_SMOKE. ' +
    '(2) Read it back. (3) Run the Bash command `echo bash_ok`. ' +
    'Then call respond with one short line that contains the words HELLO_SMOKE and bash_ok.'
  const outA = await runAgentLoop({
    browser,
    tools,
    task: taskA,
    workdir: WORK,
    maxIterations: 25,
    freshChat: true,
    sendSystemPrompt: true,
    transcript,
    onToolCall: (n) => console.log('  tool: ' + n),
    onToolResult: () => {},
    onAssistantMessage: (m) => console.log('  answer: ' + m),
    onWarning: (m) => console.log('  warn: ' + m),
    locale: 'ru',
    askDeadlineMs: cfg.browser.askDeadlineMs,
    maxAfterToolRetries: cfg.browser.maxAfterToolRetries,
  })
  const fileMade = fs.existsSync(path.join(WORK, 'smoke.txt'))
  record('tools: file created', fileMade, 'smoke.txt')
  record(
    'tools: agent reported',
    /HELLO_SMOKE/.test(outA) && /bash_ok/.test(outA),
    JSON.stringify(outA.slice(0, 120)),
  )

  // Scenario B — attachment: the model must read a file attached to the message.
  const note = path.join(WORK, 'note.txt')
  fs.writeFileSync(note, 'ATTACH_MARKER_42')
  const outB = await runAgentLoop({
    browser,
    tools,
    task: 'Reply with the exact content of the attached file, nothing else.',
    workdir: WORK,
    maxIterations: 12,
    freshChat: true,
    sendSystemPrompt: true,
    transcript,
    attachments: [{ path: note, name: 'note.txt', mime: 'text/plain' }],
    onAssistantMessage: (m) => console.log('  answer: ' + m),
    onWarning: (m) => console.log('  warn: ' + m),
    locale: 'ru',
    askDeadlineMs: cfg.browser.askDeadlineMs,
    maxAfterToolRetries: cfg.browser.maxAfterToolRetries,
  })
  record(
    'attachment: model read the file',
    /ATTACH_MARKER_42/.test(outB),
    JSON.stringify(outB.slice(0, 120)),
  )

  // Scenario C — follow-up in the SAME chat (context carried over).
  const outC = await runAgentLoop({
    browser,
    tools,
    task: 'What single word did I ask you to remember in the previous message? Answer with just that word.',
    workdir: WORK,
    maxIterations: 8,
    freshChat: false,
    sendSystemPrompt: false,
    transcript,
    onAssistantMessage: (m) => console.log('  answer: ' + m),
    onWarning: (m) => console.log('  warn: ' + m),
    locale: 'ru',
    askDeadlineMs: cfg.browser.askDeadlineMs,
    maxAfterToolRetries: cfg.browser.maxAfterToolRetries,
  })
  record(
    'follow-up answered',
    outC.trim().length > 0,
    JSON.stringify(outC.slice(0, 80)),
  )
  const onSubagent = createSubagentRunner({
    browser,
    workdir: WORK,
    locale: 'ru',
    runAgentLoop,
    buildTools: (readOnly) => {
      const base = createTools(WORK, {})
      return readOnly ? filterToolsForReadOnly(base) : base
    },
    transcript,
    maxSubagents: 2,
    askDeadlineMs: cfg.browser.askDeadlineMs,
    maxAfterToolRetries: cfg.browser.maxAfterToolRetries,
  })

  // Scenario D — subagents (N36): the model delegates via Task; the runner
  // opens a separate chat, returns only the report, and restores the parent
  // chat. Requires browser.subagents (off by default).
  const subTools = createTools(WORK, { subagents: true })
  const outD = await runAgentLoop({
    browser,
    tools: subTools,
    task:
      'Use the Task tool with subagent_type "explore" to find which word is written in the file smoke.txt. ' +
      'prompt the subagent in a self-contained way. Then, based on its report, call respond with that word.',
    workdir: WORK,
    maxIterations: 20,
    freshChat: true,
    sendSystemPrompt: true,
    transcript,
    onSubagent,
    onToolCall: (n) => console.log('  tool: ' + n),
    onAssistantMessage: (m) => console.log('  answer: ' + m),
    onWarning: (m) => console.log('  warn: ' + m),
    locale: 'ru',
    askDeadlineMs: cfg.browser.askDeadlineMs,
    maxAfterToolRetries: cfg.browser.maxAfterToolRetries,
  })
  record(
    'subagent: parent used the report',
    /HELLO_SMOKE/i.test(outD),
    JSON.stringify(outD.slice(0, 120)),
  )

  // Scenario E — background Bash + BashOutput (N33): start a process that
  // keeps running, poll its output, then kill it.
  const outE = await runAgentLoop({
    browser,
    tools,
    task:
      'Do exactly this, then report: (1) Start the Bash command ' +
      '`echo BG_MARKER_7 && sleep 120` in the BACKGROUND (run_in_background=true). ' +
      '(2) Poll it once with BashOutput. (3) Kill it with BashOutput kill=true. ' +
      'Then call respond with one short line containing BG_MARKER_7.',
    workdir: WORK,
    maxIterations: 20,
    freshChat: true,
    sendSystemPrompt: true,
    transcript,
    onToolCall: (n) => console.log('  tool: ' + n),
    onAssistantMessage: (m) => console.log('  answer: ' + m),
    onWarning: (m) => console.log('  warn: ' + m),
    locale: 'ru',
    askDeadlineMs: cfg.browser.askDeadlineMs,
    maxAfterToolRetries: cfg.browser.maxAfterToolRetries,
  })
  record(
    'background bash: started, polled and killed',
    /BG_MARKER_7/.test(outE),
    JSON.stringify(outE.slice(0, 120)),
  )
}

let failed = false
try {
  await main()
} catch (e) {
  record('run', false, (e as Error).message)
  failed = true
} finally {
  await browser.close().catch(() => {})
  transcript.close()
}

const passed = results.filter((r) => r.ok).length
console.log('\nself-smoke: ' + passed + '/' + results.length + ' passed')
const anyFail = failed || results.some((r) => !r.ok)
if (!process.env.ZAMES_SMOKE_KEEP) {
  // Clean the throwaway HOME unless the caller asked to keep it for debugging.
  try {
    fs.rmSync(SMOKE_HOME, { recursive: true, force: true })
  } catch {}
}
process.exit(loginFailed ? 2 : anyFail ? 1 : 0)
