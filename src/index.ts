#!/usr/bin/env node
import path from 'path'
import fs from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { theme } from './theme.js'

import { DeepSeekBrowser } from './browser.js'
import { createTools } from './tools.js'
import { runAgentLoop } from './agent-loop.js'
import { createSpinner } from './spinner.js'
import {
  LineEditor,
  expandPastes,
  pasteReplacement,
  formatCompactTokens,
  type PasteBlock,
} from './input.js'
import {
  parseImagePaste,
  extForMime,
  saveToTemp,
  guessMime,
  isImageName,
  formatSize,
  looksLikeFilePath,
  readClipboardImageDetailed,
  sniffMime,
  readWindowsClipboardFiles,
  hasClipboardTool,
} from './attachments.js'
import {
  loadConfig,
  DEFAULTS,
  CONFIG_PATHS,
  ZAMES_HOME,
  CONFIG_SCHEMA,
  getByPath,
  validateConfigValue,
  writeConfigValue,
  resetConfigValue,
  type ConfigField,
} from './config.js'
import { runConfigMenu } from './config-menu.js'
import {
  translate,
  normalizeLocale,
  localeDisplayName,
  isLocale,
  type Locale,
} from './i18n.js'
import { Transcript } from './transcript.js'
import { UndoStore } from './undo.js'
import { selfReview, selfDiff, selfApply, selfList } from './self-review.js'
import {
  formatDiff,
  diffGitArgs,
  parseTranscript,
  summarizeTranscript,
  renderCost,
  formatExport,
  defaultExportPath,
  renderDoctor,
  renderPermissions,
  resolveExtraDir,
  buildReviewPrompt,
  formatDuration,
  trimRestoredMessages,
  RESTORED_HISTORY_LIMIT,
  mergeMessages,
  isSlashCommand,
  parseQueueCommand,
  parseLiveToggle,
  parseGoalCommand,
  isLiveConfigCommand,
  withGoal,
  formatQueueList,
  ctrlCEscalation,
  type RestoredMessage,
} from './commands.js'
import { performCompact } from './compact.js'
import {
  Scheduler,
  parseInterval,
  formatInterval,
  parseCron,
} from './scheduler.js'
import { renderMarkdown } from './markdown.js'
import { closeWeb } from './web.js'
import {
  saveSession,
  loadLastSession,
  listSessions,
  sessionsDir,
} from './sessions.js'
import type { ToolDef } from './types.js'
import type { ChatInfo } from './browser.js'
import type { McpPool } from './mcp.js'

interface PendingMessage {
  text: string
  attachments?: Array<{ path: string; name: string; mime: string }>
}

interface RunTaskOptions {
  transcript: Transcript
  freshChat: boolean
  sendSystemPrompt: boolean
  queue?: PendingMessage[]
  ui?: LineEditor | null
  onChatReady?: (chatId: string | null) => void
  /** Called at the between-tools seam when the context is nearly full. */
  onAutoCompact?: (() => Promise<string | null>) | null
  /** Fill percentage at which onAutoCompact fires. */
  autoCompactPct?: number
  /** The context window size (tokens) for the threshold. */
  contextLimit?: number
  /** Current context size (tokens) or null. */
  getTokenUsage?: (() => number | null) | null
  /** Long-lived session goal, prepended to every task message. */
  goal?: string | null
}

interface ReviewMode {
  snapDir: string
  snapName: string
  originalWorkdir: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NL = String.fromCharCode(10)

// True when a DeepSeek session/credentials were stored earlier (auth.json).
// Used by /doctor to report that auto re-login is ready.
function authMarkerExists(): boolean {
  try {
    return existsSync(path.join(ZAMES_HOME, 'auth.json'))
  } catch {
    return false
  }
}

// ---------- CLI parsing ----------

const args = process.argv.slice(2)

function getArg(flag: string, fallback: string | null = null): string | null {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

function hasFlag(flag: string): boolean {
  return args.includes(flag)
}

function getPositional(): string[] {
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (['--dir', '--task', '--max-iter', '--project', '--chat'].includes(a)) {
      i++
      continue
    }
    if (a.startsWith('--')) continue
    positional.push(a)
  }
  return positional
}

// /compact asks the OLD chat for a summary. If browser.ask() exhausts its own
// rate-limit budget, aborting the whole compaction used to force the operator
// to start over. We retry the summary call a few times instead (inside
// performCompact()).
// How many restored messages the LOCAL fallback summary keeps when the model
// could not produce one (a rate limit / server error must not lose the
// compaction).
const COMPACT_FALLBACK_LIMIT = 40

const config = loadConfig()

// Current interface/agent language. Changed by the /config lang <ru|en> command.
let currentLocale: Locale = isLocale(config.ui?.locale)
  ? config.ui.locale
  : 'ru'
// Translation: reads currentLocale at call time, so a language change takes
// effect immediately, without a restart (for lines printed afterwards).
const t = (key: string, params?: Record<string, string | number>): string =>
  translate(currentLocale)(key, params)

// Headless is the default. --headed forces a visible window (useful for the
// first sign-in or debugging the DOM). --headless keeps it explicit.
const headless = hasFlag('--headed')
  ? false
  : hasFlag('--headless') || config.headless
const debug = hasFlag('--debug') || config.debug
const calibrate = hasFlag('--calibrate')
const maxIterArg = getArg('--max-iter', null)
const maxIter = maxIterArg !== null ? Number(maxIterArg) : config.maxIterations

const positional = getPositional()
const task = getArg('--task', positional.join(' ').trim() || null)
const chatIdArg = getArg('--chat', null)
// When resuming an existing chat, the system-prompt is by default NOT
// resent (it is already at the start of the chat). The --resend-prompt flag
// forces resending it — for example, if the prompt was updated.
const resendPrompt = hasFlag('--resend-prompt')
// By default a NEW chat is started on launch (context is not carried over).
// --resume-last: return to the last session for the working directory.
// --new-chat: kept for compatibility — this is the default behavior anyway.
const newChatFlag = hasFlag('--new-chat')
const resumeLastFlag = hasFlag('--resume-last')

// ---------- session persistence ----------
// We store sessions (DeepSeek chats) in ~/.zames/.sessions so they survive
// a restart and are available for explicit restore (--resume-last,
// --chat <id>, /resume <n>). They are NOT brought up automatically on launch.
// Previously there was a single last-chat.json file that got lost when the
// project changed and gave no list of sessions to restore.
function saveLastChat(id: string | null, workdir = '', title = ''): void {
  if (!id) return
  saveSession({ id, workdir, title })
}

function loadLastChat(workdir = ''): string | null {
  const s = loadLastSession(workdir)
  return s ? s.id : null
}

// Persistent per-project session goal (set by /goal). Kept OUT of the session
// JSON (a session == a DeepSeek chat) because the goal is a property of the
// PROJECT, not of one chat: it must survive /new and /compact. Best-effort —
// a missing/unreadable file simply means "no goal".
function goalFilePath(workdir: string): string {
  return path.join(workdir, '.zames-goal')
}

async function loadGoal(workdir: string): Promise<string | null> {
  try {
    const txt = await fs.readFile(goalFilePath(workdir), 'utf-8')
    const trimmed = txt.trim()
    return trimmed || null
  } catch {
    return null
  }
}

async function saveGoal(workdir: string, goal: string | null): Promise<void> {
  try {
    if (goal && goal.trim()) {
      await fs.writeFile(goalFilePath(workdir), goal.trim() + '\n', 'utf-8')
    } else {
      await fs.rm(goalFilePath(workdir), { force: true })
    }
  } catch {
    // best-effort: a failed write must not break the command
  }
}

// ---------- hot reload ----------
// We keep references to the logic modules in the mod object. The /reload
// command re-reads them via a dynamic import with a timestamp query — Node
// caches ESM by URL, so such an import returns a fresh version of the module.
// The browser, chat and current state are NOT restarted: only the logic is updated.
// In dev mode tsx loads the .ts sources from src/, and in the built dist — .js.
// A dynamic import with the ?t= query bypasses tsx's extension rewriting,
// so we pick the extension ourselves — from the actual file of the current module.
const SRC_EXT = /[.]ts$/.test(new URL(import.meta.url).pathname) ? '.ts' : '.js'
const RELOADABLE = [
  'mcp',
  'tools',
  'extraTools',
  'agent-loop',
  'system-prompt',
  'gitTools',
  'web',
  'self-review',
  'diff',
  'undo',
  'confirm',
  'transcript',
  'spinner',
  'config',
]

interface ModBag {
  createTools: typeof createTools
  runAgentLoop: typeof runAgentLoop
  buildSystemPrompt: typeof import('./system-prompt.js').buildSystemPrompt
  selfReview: typeof selfReview
  selfDiff: typeof selfDiff
  selfApply: typeof selfApply
  selfList: typeof selfList
  closeWeb: typeof closeWeb
  createSpinner: typeof createSpinner
  createMcpPool: typeof import('./mcp.js').createMcpPool
}

const mod: ModBag = {
  createTools,
  runAgentLoop,
  buildSystemPrompt: null as unknown as ModBag['buildSystemPrompt'],
  selfReview,
  selfDiff,
  selfApply,
  selfList,
  closeWeb,
  createSpinner,
  createMcpPool: null as unknown as ModBag['createMcpPool'],
}

async function reloadModules(): Promise<{ count: number; errors: string[] }> {
  const stamp = Date.now()
  const loaded = new Map<string, Record<string, unknown>>()
  const errors: string[] = []
  for (const base of RELOADABLE) {
    const rel = './' + base + SRC_EXT
    try {
      const url = new URL(rel, import.meta.url)
      url.searchParams.set('t', String(stamp))
      const m = (await import(url.href)) as Record<string, unknown>
      loaded.set(base, m)
    } catch (e) {
      errors.push(rel + ': ' + (e as Error).message)
    }
  }

  const pick = (base: string, name: string): unknown => loaded.get(base)?.[name]

  if (pick('tools', 'createTools'))
    mod.createTools = pick('tools', 'createTools') as ModBag['createTools']
  if (pick('agent-loop', 'runAgentLoop'))
    mod.runAgentLoop = pick(
      'agent-loop',
      'runAgentLoop',
    ) as ModBag['runAgentLoop']
  if (pick('system-prompt', 'buildSystemPrompt'))
    mod.buildSystemPrompt = pick(
      'system-prompt',
      'buildSystemPrompt',
    ) as ModBag['buildSystemPrompt']
  if (pick('self-review', 'selfReview'))
    mod.selfReview = pick('self-review', 'selfReview') as ModBag['selfReview']
  if (pick('self-review', 'selfDiff'))
    mod.selfDiff = pick('self-review', 'selfDiff') as ModBag['selfDiff']
  if (pick('self-review', 'selfApply'))
    mod.selfApply = pick('self-review', 'selfApply') as ModBag['selfApply']
  if (pick('self-review', 'selfList'))
    mod.selfList = pick('self-review', 'selfList') as ModBag['selfList']
  if (pick('web', 'closeWeb'))
    mod.closeWeb = pick('web', 'closeWeb') as ModBag['closeWeb']
  if (pick('spinner', 'createSpinner'))
    mod.createSpinner = pick(
      'spinner',
      'createSpinner',
    ) as ModBag['createSpinner']

  if (pick('mcp', 'createMcpPool'))
    mod.createMcpPool = pick('mcp', 'createMcpPool') as ModBag['createMcpPool']

  return { count: loaded.size, errors }
}

// Initial load so that mod.buildSystemPrompt and the rest are populated.
await reloadModules()

// Dev mode: auto-reload of the logic modules before each task.
// Enabled by the --dev flag (`npm run dev` sets it) or config.hotReload === true.
// In normal mode (npm start, global zames) auto-reload is off.
const devMode = hasFlag('--dev') || config.hotReload === true

// Safe auto-reload: on a load error we keep the previous working modules.
async function autoReload(): Promise<void> {
  if (!devMode) return
  const { errors } = await reloadModules()
  if (errors.length) {
    console.error(theme.warn(t('reload.auto_partial')))
    for (const e of errors) console.error(theme.warn('  ' + e))
  }
  warnIfBrowserChanged()
}

// `browser.ts` is NOT in RELOADABLE: it is imported statically (once) and the
// live DeepSeekBrowser instance owns the Playwright context/page/timers, so a
// hot swap is unsafe. In dev mode (`npm run dev` = tsx over src/) the operator
// therefore keeps running the OLD browser code after editing it, and a fix
// "does not work" until the process is restarted. We detect the mtime change
// and print a ONE-TIME hint so this is never a silent trap again.
let browserMtime = 0
let browserChangedWarned = false
function browserSourcePath(): string {
  // In dev the running file is src/index.ts; in the built dist — dist/index.js
  // with the sources next to it (../src). Either way we look for browser.ts.
  const srcDir = /[.]ts$/.test(new URL(import.meta.url).pathname)
    ? path.dirname(fileURLToPath(import.meta.url))
    : path.join(__dirname, '..', 'src')
  return path.join(srcDir, 'browser.ts')
}
function warnIfBrowserChanged(): void {
  if (!devMode) return
  try {
    const p = browserSourcePath()
    const st = statSync(p)
    if (!browserMtime) {
      browserMtime = st.mtimeMs
      return
    }
    if (st.mtimeMs !== browserMtime && !browserChangedWarned) {
      browserChangedWarned = true
      console.error(theme.warn(t('reload.browser_restart')))
    }
  } catch {}
}

// ---------- helpers ----------

function printHelp(): void {
  console.log(`
${theme.bold('zames')} — ${t('app.tagline')}

${theme.bold(t('help.options'))}
  --dir <path>       ${t('help.opt.dir')}
  --task <text>      ${t('help.opt.task')}
  --chat <id>        ${t('help.opt.chat')}
  --resume-last      ${t('help.opt.resume_last')}
  --new-chat         ${t('help.opt.new_chat')}
  --resend-prompt    ${t('help.opt.resend_prompt')}
  --max-iter <n>     ${t('help.opt.max_iter', { n: config.maxIterations })}
  --headless         ${t('help.opt.headless')}
  --headed           ${t('help.opt.headed')}
  --debug            ${t('help.opt.debug')}
  --calibrate        ${t('help.opt.calibrate')}
  --dev              ${t('help.opt.dev')}
  --version, -v      ${t('help.opt.version')}
  --help, -h         ${t('help.opt.help')}

${theme.bold(t('help.while_working'))}
  ${t('help.key.queue')}
  ${t('help.key.history')}
  ${t('help.key.words')}
  ${t('help.key.slash')}
  ${t('help.key.newline')}
  ${t('help.key.backslash')}
  ${t('help.key.attach')}
  ${t('help.key.esc')}

${theme.bold(t('help.commands'))}
  ${t('help.cmd.new')}
  ${t('help.cmd.sessions')}
  ${t('help.cmd.resume_id')}
  ${t('help.cmd.chats')}
  ${t('help.cmd.resume')}
  ${t('help.cmd.chat')}
  ${t('help.cmd.cd')}
  ${t('help.cmd.pwd')}
  ${t('help.cmd.status')}
  ${t('help.cmd.reload')}
  ${t('help.cmd.undo')}
  ${t('help.cmd.undo_list')}
  ${t('help.cmd.transcript')}
 ${t('help.cmd.diff')}
 ${t('help.cmd.cost')}
 ${t('help.cmd.export')}
 ${t('help.cmd.doctor')}
 ${t('help.cmd.permissions')}
 ${t('help.cmd.add_dir')}
 ${t('help.cmd.review')}
 ${t('help.cmd.goal')}
 ${t('help.cmd.loop')}
 ${t('help.cmd.cron')}
 ${t('help.cmd.jobs')}
 ${t('help.cmd.thinking')}
 ${t('help.cmd.web')}
 ${t('help.cmd.compact')}
  ${t('help.cmd.queue')}
  ${t('help.cmd.config')}
  ${t('help.cmd.lang')}
  ${t('help.cmd.debug_dom')}
  ${t('help.cmd.help')}
  ${t('help.cmd.exit')}

${theme.bold(t('help.self_review'))}
  ${t('help.self.review')}
  ${t('help.self.fix')}
  ${t('help.self.done')}
  ${t('help.self.list')}
  ${t('help.self.diff')}
  ${t('help.self.apply')}
${dynamicCommands.length ? '\n' + theme.bold(t('help.skills')) + '\n' + dynamicCommands.map((d) => '  ' + d.name.padEnd(24) + ' ' + d.description).join('\n') : ''}

${theme.bold(t('help.files'))}
  ${t('help.files.logs')}        ${config.transcript.dir}
  ${t('help.files.undo')}        ~/.zames/undo
  ${t('help.files.sessions')}      ${sessionsDir()}
  ${t('help.files.profile')}     ~/.zames/profile
  ${t('help.files.snapshots')}    ~/.zames/snapshots
  ${t('help.files.tmp')}   <project>/tmp (.gitignore, cleaned on start)
  ${t('help.files.config')}      ${CONFIG_PATHS.HOME_CONFIG}
               ${CONFIG_PATHS.PROJECT_CONFIG}
`)
}

function dirLabel(p: string): string {
  return path.basename(p) || p
}

// List of slash commands for completion when you type «/» (Tab — complete).
// The description is localized by the help.cmd.* key at display time — see
// buildSlashCommands().
const SLASH_COMMANDS: Array<{ name: string; key: string }> = [
  { name: '/help', key: 'help.cmd.help' },
  { name: '/new', key: 'help.cmd.new' },
  { name: '/clear', key: 'help.cmd.new' },
  { name: '/sessions', key: 'help.cmd.sessions' },
  { name: '/chats', key: 'help.cmd.chats' },
  { name: '/resume', key: 'help.cmd.resume' },
  { name: '/resume-id', key: 'help.cmd.resume_id' },
  { name: '/chat', key: 'help.cmd.chat' },
  { name: '/cd', key: 'help.cmd.cd' },
  { name: '/pwd', key: 'help.cmd.pwd' },
  { name: '/status', key: 'help.cmd.status' },
  { name: '/reload', key: 'help.cmd.reload' },
  { name: '/undo', key: 'help.cmd.undo' },
  { name: '/undo-list', key: 'help.cmd.undo_list' },
  { name: '/transcript', key: 'help.cmd.transcript' },
  { name: '/diff', key: 'help.cmd.diff' },
  { name: '/cost', key: 'help.cmd.cost' },
  { name: '/export', key: 'help.cmd.export' },
  { name: '/doctor', key: 'help.cmd.doctor' },
  { name: '/permissions', key: 'help.cmd.permissions' },
  { name: '/add-dir', key: 'help.cmd.add_dir' },
  { name: '/review', key: 'help.cmd.review' },
  { name: '/goal', key: 'help.cmd.goal' },
  { name: '/loop', key: 'help.cmd.loop' },
  { name: '/cron', key: 'help.cmd.cron' },
  { name: '/jobs', key: 'help.cmd.jobs' },
  { name: '/thinking', key: 'help.cmd.thinking' },
  { name: '/web', key: 'help.cmd.web' },
  { name: '/compact', key: 'help.cmd.compact' },
  { name: '/queue', key: 'help.cmd.queue' },
  { name: '/config', key: 'help.cmd.config' },
  { name: '/skills', key: 'help.cmd.skills' },
  { name: '/memory', key: 'help.cmd.memory' },
  { name: '/init', key: 'help.cmd.init' },
  { name: '/mcp', key: 'help.cmd.mcp' },
  { name: '/debug-dom', key: 'help.cmd.debug_dom' },
  { name: '/self-review', key: 'help.self.review' },
  { name: '/self-fix', key: 'help.self.fix' },
  { name: '/self-done', key: 'help.self.done' },
  { name: '/self-list', key: 'help.self.list' },
  { name: '/self-diff', key: 'help.self.diff' },
  { name: '/self-apply', key: 'help.self.apply' },
  { name: '/exit', key: 'help.cmd.exit' },
  { name: '/quit', key: 'help.cmd.exit' },
]

// Dynamically discovered skills and custom commands for the current workdir.
// Filled in by refreshDynamicCommands() and shown in the «/» hint list and
// help. Skills are surfaced as /skill-name entries (user-invokable only).
let dynamicCommands: Array<{ name: string; description: string }> = []

async function refreshDynamicCommands(workdir: string): Promise<void> {
  const out: Array<{ name: string; description: string }> = []
  try {
    const { loadSkills, loadCommands } = await import('./context.js')
    const skills = await loadSkills(workdir)
    for (const s of skills) {
      if (!s.userInvokable) continue
      out.push({
        name: '/' + s.name,
        description: s.description || t('help.cmd.skill'),
      })
    }
    const cmds = await loadCommands(workdir)
    for (const c of cmds) {
      out.push({
        name: '/' + c.name,
        description: c.description || t('help.cmd.custom'),
      })
    }
  } catch {
    // best-effort: a broken skill/command must not break the CLI
  }
  dynamicCommands = out
}

// Expand a slash target (skill or custom command) into a task string.
// Returns null when the name is neither a skill nor a custom command.
async function expandSlashTarget(
  workdir: string,
  name: string,
  rest: string,
): Promise<string | null> {
  try {
    const { loadSkills, loadCommands, skillBody } = await import('./context.js')
    const commands = await loadCommands(workdir)
    const cmd = commands.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    )
    if (cmd) {
      let body = cmd.body.replace(/\{\{args\}\}/g, rest)
      body = body.replace(/\$ARGUMENTS/g, rest)
      return body.trim() || rest
    }
    const skills = await loadSkills(workdir)
    const skill = skills.find(
      (s) => s.name.toLowerCase() === name.toLowerCase() && s.userInvokable,
    )
    if (skill) {
      let body = ''
      try {
        const raw = await fs.readFile(skill.path, 'utf-8')
        body = skillBody(raw)
      } catch {
        body = ''
      }
      const header =
        'Follow the skill "' + skill.name + '" (from ' + skill.path + ').'
      const extra = rest
        ? '\n\nAdditional instructions from the operator: ' + rest
        : ''
      return header + '\n\n' + body + extra
    }
  } catch {
    // fall through: treated as an unknown command
  }
  return null
}

// Slash-command descriptions in the current language (for LineEditor hints).
function buildSlashCommands(): Array<{ name: string; description: string }> {
  const base = SLASH_COMMANDS.map((c) => ({
    name: c.name,
    description: t(c.key),
  }))
  const known = new Set(base.map((c) => c.name.toLowerCase()))
  for (const d of dynamicCommands) {
    if (known.has(d.name.toLowerCase())) continue
    base.push(d)
  }
  return base
}

// We put the agent's temporary files (one-off scripts, etc.) in
// <project>/tmp — this folder is in .gitignore and is cleaned on every launch.
const TMP_DIR = path.join(__dirname, '..', 'tmp')

// Resolve a pasted string into a path to an existing file. Handles quoted
// paths (drag&drop from some file managers adds quotes) and paths relative to
// the working directory.
async function resolveAttachPath(
  workdir: string,
  raw: string,
): Promise<string | null> {
  let s = String(raw || '').trim()
  if (!s) return null
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1)
  }
  s = s.replace(/\\ /g, ' ')
  if (!looksLikeFilePath(s) && !isImageName(s)) return null
  const candidates = path.isAbsolute(s)
    ? [s]
    : [
        // Most common: relative to the project (working) directory.
        path.resolve(workdir, s),
        // The operator may paste a path relative to the terminal's cwd (which
        // can be the parent of the project) or copy it with the project name
        // included, e.g. "zames_pro/tmp/image.png" while workdir is already
        // .../zames_pro. Try both so the marker appears instead of raw text.
        path.resolve(process.cwd(), s),
        path.resolve(workdir, '..', s),
      ]
  for (const c of candidates) {
    const st = await fs.stat(c).catch(() => null)
    if (st && st.isFile()) return c
  }
  return null
}

async function cleanTmpDir(): Promise<void> {
  try {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
    await fs.mkdir(TMP_DIR, { recursive: true })
  } catch (e) {
    if (debug) console.error('tmp: не удалось очистить:', (e as Error).message)
  }
}

// Terminal line input with correct paste handling (Shift+Insert,
// Ctrl+Shift+V, right mouse button, etc.).
//
// Why a custom reader instead of readline:
//   1) readline submits the line on the FIRST newline. When pasting
//      multiline text this caused immediate submission and only the first
//      line went to the chat. Here newlines inside a paste are replaced with
//      spaces, and submission happens only on a single Enter press.
//   2) We enable bracketed paste mode (\x1b[?2004h): the terminal wraps the
//      pasted text in the markers \x1b[200~ … \x1b[201~, so we know for sure
//      that this is a paste, not keyboard typing, and Enter inside it is not
//      treated as submission.
async function promptOnce(question: string): Promise<string> {
  const stdin = process.stdin
  const stdout = process.stdout

  // Non-TTY (pipe, redirect): read everything up to EOF as a single string.
  if (!stdin.isTTY || !stdin.setRawMode) {
    const chunks: Buffer[] = []
    return await new Promise((resolve) => {
      const onData = (b: Buffer) => chunks.push(b)
      const onEnd = () => {
        stdin.removeListener('data', onData)
        stdin.removeListener('end', onEnd)
        resolve(Buffer.concat(chunks).toString('utf-8'))
      }
      stdin.on('data', onData)
      stdin.on('end', onEnd)
      stdin.resume()
    })
  }

  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()

  // We enable/disable bracketed paste in pairs.
  stdout.write('\x1b[?2004h')
  stdout.write(question)

  let line = ''
  let cursor = 0
  let inPaste = false
  const PASTE_START = '\x1b[200~'
  const PASTE_END = '\x1b[201~'

  const redraw = () => {
    // Return to the start of the line, erase and print again.
    stdout.write(String.fromCharCode(13))
    stdout.write('\x1b[K')
    stdout.write(question + line)
    // Put the cursor in the right position.
    const back = line.length - cursor
    if (back > 0) stdout.write('\x1b[' + back + 'D')
  }

  return await new Promise((resolve) => {
    const finish = (value: string, submit: boolean) => {
      stdin.removeListener('data', onData)
      stdout.write('\x1b[?2004l')
      if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
      if (submit) stdout.write(String.fromCharCode(10))
      resolve(value)
    }

    const insertText = (text: string) => {
      // Normalize newlines: they come from a multiline paste but mean
      // "submit". Inside the message we replace them with a space so the
      // whole paste goes as ONE message.
      const clean = text
        .replace(/\r\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\n/g, ' ')
      line = line.slice(0, cursor) + clean + line.slice(cursor)
      cursor += clean.length
    }

    const onData = (buf: Buffer) => {
      let s = buf.toString('utf-8')

      // Fallback for terminals without bracketed paste: if the whole chunk is
      // a "bare" newline (one byte), then Enter was pressed → submit.
      // If newlines came TOGETHER with other text in one chunk — that's a
      // paste; such newlines don't submit the message but are replaced with
      // spaces (see insertText).
      if (!inPaste && (s === '\r' || s === '\n')) {
        return finish(line, true)
      }

      while (s.length) {
        if (inPaste) {
          const end = s.indexOf(PASTE_END)
          if (end === -1) {
            insertText(s)
            s = ''
          } else {
            insertText(s.slice(0, end))
            s = s.slice(end + PASTE_END.length)
            inPaste = false
          }
          redraw()
          continue
        }

        const start = s.indexOf(PASTE_START)
        if (start !== -1) {
          // Everything before the marker is processed as regular input.
          const before = s.slice(0, start)
          s = s.slice(start + PASTE_START.length)
          inPaste = true
          if (before) {
            for (const ch of before) {
              if (ch === '\r' || ch === '\n') {
                /* inside a paste — skip */
              } else insertText(ch)
            }
            redraw()
          }
          continue
        }

        const ch = s[0]
        const code = s.charCodeAt(0)
        s = s.slice(1)

        if (ch === '\r' || ch === '\n') {
          // A newline inside a chunk with other text (paste without
          // bracketed paste): don't submit, insert a space instead.
          insertText(' ')
          redraw()
          continue
        }
        if (code === 3) {
          // Ctrl+C — abort input.
          return finish('', true)
        }
        if (code === 4) {
          // Ctrl+D — like submitting an empty line.
          return finish(line, true)
        }
        if (code === 21) {
          // Ctrl+U — erase the line.
          line = ''
          cursor = 0
          redraw()
          continue
        }
        if (code === 127 || code === 8) {
          // Backspace.
          if (cursor > 0) {
            line = line.slice(0, cursor - 1) + line.slice(cursor)
            cursor--
            redraw()
          }
          continue
        }
        if (ch === '\x1b') {
          // Escape sequences (arrows, Home/End, Delete…).
          const rest = s
          if (rest.startsWith('[D')) {
            if (cursor > 0) cursor--
            s = s.slice(2)
            redraw()
            continue
          }
          if (rest.startsWith('[C')) {
            if (cursor < line.length) cursor++
            s = s.slice(2)
            redraw()
            continue
          }
          if (rest.startsWith('[H') || rest.startsWith('[1~')) {
            cursor = 0
            s = s.slice(rest.startsWith('[1~') ? 3 : 2)
            redraw()
            continue
          }
          if (rest.startsWith('[F') || rest.startsWith('[4~')) {
            cursor = line.length
            s = s.slice(rest.startsWith('[4~') ? 3 : 2)
            redraw()
            continue
          }
          if (rest.startsWith('[3~')) {
            // Delete.
            if (cursor < line.length) {
              line = line.slice(0, cursor) + line.slice(cursor + 1)
              redraw()
            }
            s = s.slice(3)
            continue
          }
          // Other ESC sequences are skipped up to a letter/tilde.
          const m = s.match(/^\[[0-9;]*[A-Za-z~]/)
          if (m) s = s.slice(m[0].length)
          continue
        }
        if (code < 32) continue // other control characters are ignored

        insertText(ch)
        redraw()
      }
    }

    stdin.on('data', onData)
  })
}

// Keyboard monitoring while the agent works.
//
// The terminal stays live while the agent thinks:
//   - Esc (or Ctrl+C) — abort the current generation (a Stop click in the browser);
//   - typing + Enter — queue a message; it goes to the agent right after
//     the current task finishes (like "send during generation" in the
//     DeepSeek web version).
//
// Input is buffered without a line editor: the typed text is shown in the
// spinner line via onChange -> ui.setPending(). Enter sends the buffer to
// onQueue, an empty Enter is ignored. Backspace, Ctrl+U, Esc sequences
// (arrows/Home/End/Delete are ignored) and bracketed paste are supported.
function watchInput({
  onEscape,
  onChange,
  onQueue,
}: {
  onEscape?: () => void
  onChange?: (text: string) => void
  onQueue?: (text: string) => void
} = {}): () => void {
  const stdin = process.stdin
  if (!stdin.isTTY || !stdin.setRawMode) return () => {}

  // Control characters are assembled from codes: this file must not contain
  // "raw" ESC/CR/LF in string literals (see AGENTS.md).
  const ESC = String.fromCharCode(27)
  const CSI = String.fromCharCode(91)
  const CR = String.fromCharCode(13)
  const LF = String.fromCharCode(10)

  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()
  process.stdout.write(ESC + '[?2004h')

  let buf = ''
  let inPaste = false
  let pasteBuf = ''
  const pastes: PasteBlock[] = []
  const PASTE_START = ESC + '[200~'
  const PASTE_END = ESC + '[201~'
  const CSI_RE = new RegExp('^' + CSI + '[0-9;]*[A-Za-z~]')

  const emitChange = (): void => {
    if (onChange) onChange(buf)
  }

  // Pasted text: small pastes (1–2 lines) are flattened into one line;
  // large ones (3+ lines) are collapsed into "[Pasted lines#N]" (the original
  // text is expanded back when the message is queued).
  const insert = (text: string) => {
    buf += text
      .split(CR + LF)
      .join(' ')
      .split(CR)
      .join(' ')
      .split(LF)
      .join(' ')
  }

  const insertPaste = (raw: string) => {
    const rep = pasteReplacement(raw)
    if (!rep) {
      insert(raw)
      return
    }
    pastes.push(rep)
    buf += rep.marker
  }

  function onData(data: Buffer) {
    let s = data.toString('utf-8')

    // A single Esc — abort generation. Arrows come as a whole chunk and
    // don't reach here.
    if (!inPaste && s === ESC) {
      if (onEscape) onEscape()
      return
    }

    while (s.length) {
      if (inPaste) {
        const end = s.indexOf(PASTE_END)
        if (end === -1) {
          pasteBuf += s
          s = ''
        } else {
          pasteBuf += s.slice(0, end)
          s = s.slice(end + PASTE_END.length)
          inPaste = false
          insertPaste(pasteBuf)
          pasteBuf = ''
        }
        emitChange()
        continue
      }

      const start = s.indexOf(PASTE_START)
      if (start !== -1) {
        const before = s.slice(0, start)
        s = s.slice(start + PASTE_START.length)
        inPaste = true
        pasteBuf = ''
        if (before) {
          insert(before)
          emitChange()
        }
        continue
      }

      const ch = s[0]
      const code = s.charCodeAt(0)
      s = s.slice(1)

      if (ch === CR || ch === LF) {
        const text = expandPastes(pastes, buf).trim()
        buf = ''
        pastes.length = 0
        emitChange()
        if (text && onQueue) onQueue(text)
        continue
      }
      if (code === 3) {
        // Ctrl+C — like Esc: abort generation.
        if (onEscape) onEscape()
        continue
      }
      if (code === 21) {
        // Ctrl+U — clear what was typed.
        buf = ''
        pastes.length = 0
        emitChange()
        continue
      }
      if (code === 127 || code === 8) {
        // Backspace.
        if (buf) {
          buf = buf.slice(0, -1)
          emitChange()
        }
        continue
      }
      if (ch === ESC) {
        // Escape sequence (arrows, Home/End, Delete) — skip.
        const m = s.match(CSI_RE)
        if (m) s = s.slice(m[0].length)
        continue
      }
      if (code < 32) continue // other control characters — ignore

      buf += ch
      emitChange()
    }
  }

  const handler = (data: Buffer) => onData(data)
  stdin.on('data', handler)
  return () => {
    stdin.removeListener('data', handler)
    process.stdout.write(ESC + '[?2004l')
    if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
  }
}

// ---------- workdir resolution ----------

// The agent works in the directory it was launched from (process.cwd()).
// This is the sandbox root: tools cannot go above it.
async function resolveWorkdir(): Promise<string> {
  const explicitDir = getArg('--dir', null)
  const dir = explicitDir ? path.resolve(explicitDir) : process.cwd()
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(t('msg.not_dir', { v: dir }))
  }
  return dir
}

// ---------- restored dialogue ----------

/**
 * Print the dialogue of the just-opened chat into the terminal. Called by
 * /resume, /resume-id and on startup when a previous session is restored, so
 * the operator sees the context instead of a bare "Chat opened.".
 *
 * Best-effort: a DOM-scraping failure must never break the restore.
 */
async function printRestoredHistory(
  browser: DeepSeekBrowser,
  ui: { printAbove: (t: string) => void } | null,
  chatId: string | null = null,
): Promise<void> {
  // Prefer DeepSeek's own history endpoint (complete, unvirtualized); fall
  // back to scraping the rendered DOM when the request fails.
  let all: RestoredMessage[] = []
  let fetchCount = -1
  let domCount = -1
  if (chatId && browser.fetchChatMessages) {
    all = await browser.fetchChatMessages(chatId).catch(() => [])
    fetchCount = all.length
  }
  if (!all.length && browser.readChatMessages) {
    all = await browser.readChatMessages().catch(() => [])
    domCount = all.length
  }
  // `all` is the raw history (mostly protocol noise). `displayable` is what
  // survives normalization; `messages` is the last RESTORED_HISTORY_LIMIT of
  // those. The "truncated" note must compare the DISPLAYABLE count with the
  // limit (comparing `all.length` always fired, because tool-calls are
  // dropped and the raw history is always longer).
  const displayable = trimRestoredMessages(all, 0)
  const messages = trimRestoredMessages(all)
  // Always surface the diagnostic line when the history could not be turned
  // into anything printable — otherwise "the dialogue is empty" is a dead end
  // (was the fetch blocked? did the chat really have no user turns?).
  if (!all.length || (debug && !messages.length)) {
    console.log(
      theme.dim(
        `[history] chat=${chatId || '-'} fetch=${fetchCount} dom=${domCount} raw=${all.length} shown=${messages.length} auth=${browser._apiAuth ? 'yes' : 'no'} err=${browser._lastHistoryError || '-'}`,
      ),
    )
  }
  if (!all.length) {
    console.log(theme.system(t('chats.history_empty')))
    return
  }
  if (!messages.length) {
    // The history exists but contains only service/protocol messages (e.g.
    // a chat where only the system-prompt and tool-calls were stored).
    console.log(
      theme.system(t('chats.history_service_only', { n: String(all.length) })),
    )
    return
  }
  const out = (text: string): void => {
    if (ui) ui.printAbove(text)
    else console.log(text)
  }
  out(theme.system(t('chats.history_title')))
  const restoredTokens = browser.getLastTokenUsage()
  if (typeof restoredTokens === 'number') {
    out(theme.dim(t('chats.history_tokens', { v: String(restoredTokens) })))
    // Warn when the restored chat is near the context limit, and suggest
    // /compact. The threshold mirrors the auto-compact one so the operator
    // sees the same signal whether or not auto-compact is enabled.
    const limit = config.ui.contextLimit
    if (limit > 0) {
      const pct = (restoredTokens / limit) * 100
      if (pct >= 80) {
        out(
          theme.warn(
            t('chats.history_near_limit', { pct: String(Math.round(pct)) }),
          ),
        )
      }
    }
  }
  for (const m of messages) {
    if (m.role === 'user') {
      out(theme.user('❯ ' + t('chats.history_you') + ': ') + m.text.trim())
    } else {
      out(
        NL +
          theme.assistant('● ' + t('chats.history_agent') + ':') +
          NL +
          renderMarkdown(m.text.trim()) +
          NL,
      )
    }
  }
  if (displayable.length > messages.length) {
    out(
      theme.dim(
        t('chats.history_truncated', { n: String(RESTORED_HISTORY_LIMIT) }),
      ),
    )
  }
}

// ---------- task runner ----------

async function runTask(
  browser: DeepSeekBrowser,
  tools: ToolDef[],
  taskText: string,
  workdir: string,
  opts: RunTaskOptions,
  attachments: Array<{ path: string; name: string; mime: string }> = [],
): Promise<void> {
  const {
    transcript,
    freshChat,
    sendSystemPrompt,
    queue = [],
    ui: editor,
    onChatReady,
    onAutoCompact = null,
    autoCompactPct = 95,
    contextLimit = 1_000_000,
    getTokenUsage = null,
    goal = null,
  } = opts

  // In TTY mode the UI is a LineEditor: it owns the input (queue, Esc,
  // Ctrl+C) and draws the status ABOVE the permanent input line. In non-TTY
  // mode (pipes) — a regular spinner + watchInput.
  // A new task from the prompt — we reset the "stop" from the previous abort.
  browser._stopped = false
  browser._abort = false

  const ui = editor || mod.createSpinner(currentLocale)
  // Mark the editor busy for the WHOLE task, not only for /init and /self-fix.
  // Esc / Ctrl+C abort the current generation only while busy; without this a
  // long-running tool (Bash, npm, MCP) could not be interrupted — Esc did
  // nothing. Cleared in the finally below.
  if (editor) editor.busy = true
  const stopWatching = editor
    ? () => {}
    : watchInput({
        onEscape: () => {
          ui.stop()
          console.error(theme.warn(t('msg.abort_gen_short')))
          browser.stopGeneration().catch(() => {})
        },
        onChange: (text) => ui.setPending(text),
        onQueue: (text) => {
          queue.push({ text })
          ui.setPending(null)
          ui.stop()
          console.log(
            theme.user(t('msg.queued', { n: queue.length })) +
              theme.assistant(text),
          )
          ui.thinking()
        },
      })

  try {
    let next: PendingMessage & {
      freshChat: boolean
      sendSystemPrompt: boolean
    } = {
      text: taskText,
      attachments,
      freshChat,
      sendSystemPrompt,
    }

    // Execute the task, then everything the user managed to type while it
    // ran. The queue may be replenished right during draining.
    //
    // NOTE: we do NOT call ui.thinking() here. runAgentLoop() fires
    // onThinking() right before the actual browser send (after the send
    // pause, system-prompt, etc.), so the spinner only appears when a
    // generation really starts. Calling it here made the spinner run for
    // the whole pre-send phase (chat creation, throttle wait) with no
    // generation in flight.
    while (true) {
      // T7: per-task summary (duration + number of tool calls + tokens).
      // Counts tools via the UI callback and reports ONE line after the task,
      // so the operator sees how long it took and how much work happened.
      const taskStart = Date.now()
      // Token delta for THIS task: accumulated_token_usage is cumulative for
      // the whole chat, so the per-task spend is after - before. Null when the
      // counter is unknown (fresh chat / no answer yet); the token part is then
      // omitted from the summary.
      const tokensBefore = getTokenUsage ? getTokenUsage() : null
      let taskTools = 0
      const outcome = await mod.runAgentLoop({
        browser,
        tools,
        task: withGoal(goal, next.text),
        workdir,
        maxIterations: maxIter,
        freshChat: next.freshChat,
        sendSystemPrompt: next.sendSystemPrompt,
        attachments: next.attachments || [],
        transcript,
        onThinking: () => ui.thinking(),
        onSendPause: (seconds) => ui.sendPause(seconds),
        onSendState: (state) => {
          if (editor) editor.setSendState(state)
        },
        onNotice: (msg) => ui.warning(msg),
        onToolCall: (name, toolArgs) => {
          taskTools++
          ui.toolCall(name, toolArgs)
        },
        onToolResult: (result) => ui.toolResult(result),
        onAssistantMessage: (msg) => ui.assistant(msg),
        onWarning: (msg) => ui.warning(msg),
        onChatReady,
        debugLog: debug,
        locale: currentLocale,
        askDeadlineMs: config.browser.askDeadlineMs,
        maxAfterToolRetries: config.browser.maxAfterToolRetries,
        // Auto-compact between tool calls when the context nears the
        // window limit. The callback is provided by the caller (runTask) so it
        // can refresh the outer currentChatId. It runs in the SAME execution
        // context (this task owns the browser send loop) and the loop awaits
        // it, so it serializes with the throttle.
        onAutoCompact,
        autoCompactPct,
        contextLimit,
        getTokenUsage,
      })

      // The loop may end WITHOUT a model answer: an exhausted iteration
      // limit or an ask() watchdog (the model stopped responding). In that
      // case no assistant message was shown, and the operator saw the run
      // just "stop" after a tool call with no explanation. Surface it.
      if (
        outcome &&
        (outcome.startsWith('Iteration limit reached') ||
          outcome.startsWith('ask() watchdog'))
      ) {
        ui.warning(outcome)
        transcript?.log('agent_no_answer', { outcome })
      }

      // T7: one summary line per task (duration + tool calls + tokens spent).
      // Printed even on an abort, so the operator sees what happened. Duration
      // is human-readable ("45s", "1m 20s", "1h 12m 45s") with LOCALIZED unit
      // labels, instead of a raw seconds count like "3129.2s". The token part
      // is the DELTA of the cumulative counter for THIS task; it is omitted
      // when the counter is unknown.
      const tokensAfter = getTokenUsage ? getTokenUsage() : null
      const tokenDelta =
        typeof tokensBefore === 'number' && typeof tokensAfter === 'number'
          ? Math.max(0, tokensAfter - tokensBefore)
          : null
      const summaryParts = [
        t('task_sum.dur', {
          dur: formatDuration(Date.now() - taskStart, {
            h: t('dur.h'),
            m: t('dur.m'),
            s: t('dur.s'),
          }),
        }),
        t('task_sum.tools', { n: String(taskTools) }),
      ]
      if (tokenDelta !== null) {
        summaryParts.push(
          t('task_sum.tokens', { n: formatCompactTokens(tokenDelta) }),
        )
      }
      const summary = theme.taskSummary('· ' + summaryParts.join(' · '))
      if (editor) editor.printAbove(summary)
      else console.log(summary)

      // Aborted (Esc/Ctrl+C) — we don't start the next tasks from the queue
      // and clear it, so "stop" really stops everything.
      if (browser._stopped) {
        queue.length = 0
        break
      }
      if (!queue.length) break

      // Merge the LEADING plain-text messages into ONE batch (fewer sends ->
      // less rate-limit risk and the operator's thoughts arrive together). We
      // stop at the first slash-command: it must NOT be sent as a task — it is
      // handled by the main loop, so we leave it (and anything after it) in
      // the queue and break out of this task's drain loop.
      let batchLen = 0
      while (batchLen < queue.length && !isSlashCommand(queue[batchLen].text)) {
        batchLen++
      }
      if (batchLen === 0) break
      const batch = queue.splice(0, batchLen)
      const merged = mergeMessages(batch)
      if (!merged.text.trim()) break
      ui.stop()
      const banner =
        batch.length === 1
          ? theme.user(t('msg.from_queue')) + theme.assistant(batch[0].text)
          : theme.user(t('msg.from_queue_batch', { n: batch.length })) +
            theme.assistant(t('msg.batch_joined', { n: batch.length }))
      if (editor) editor.printAbove(banner)
      else console.log(banner)
      transcript?.log('queued_task', { task: merged.text, count: batch.length })
      next = {
        text: merged.text,
        attachments: merged.attachments,
        freshChat: false,
        sendSystemPrompt: false,
      }
    }
  } catch (e) {
    ui.stop()
    console.error(
      theme.error(String.fromCharCode(10) + t('msg.agent_error')),
      (e as Error).message,
    )
    if (debug) console.error((e as Error).stack)
    transcript?.log('agent_error', { error: (e as Error).message })
  } finally {
    stopWatching()
    ui.stop()
    if (editor) editor.busy = false
    // Detach the send hooks so a later browser.ask() outside this task cannot
    // start a stale spinner.
    browser.onSendStart = null
    browser.onSendPause = null
    browser.onSendState = null
    browser.onNotice = null
  }
}

// ---------- main ----------

async function main(): Promise<void> {
  if (hasFlag('--version') || hasFlag('-v')) {
    const pkg = JSON.parse(
      await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf-8'),
    )
    console.log(pkg.version)
    return
  }

  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp()
    return
  }

  if (calibrate) {
    console.log(theme.warn(t('calibrate')))
  }

  await cleanTmpDir()

  let currentWorkdir: string
  let sandboxRoot: string
  try {
    currentWorkdir = await resolveWorkdir()
    // Sandbox root: the agent cannot go above the launch directory.
    sandboxRoot = currentWorkdir
  } catch (e) {
    console.error(theme.error(t('msg.workdir_error')), (e as Error).message)
    process.exit(1)
  }

  console.log(theme.system(t('msg.working_dir', { v: currentWorkdir })))

  const transcript = new Transcript({
    dir: config.transcript.dir,
    enabled: config.transcript.enabled,
    sessionName: dirLabel(currentWorkdir),
  })
  if (transcript.file) {
    console.log(theme.system(t('msg.transcript', { v: transcript.file })))
  }

  const undo = new UndoStore(config.undo)

  // MCP servers: optional external tool providers (e.g. @playwright/mcp).
  let mcpPool: McpPool | null = null
  try {
    mcpPool = await mod.createMcpPool({ workdir: currentWorkdir })
    const st = mcpPool.status()
    if (st.toolCount > 0) {
      const names = st.servers
        .filter((x) => !x.error)
        .map((x) => x.name)
        .join(', ')
      console.log(
        theme.system(
          t('mcp.loaded', { n: String(st.toolCount), servers: names }),
        ),
      )
    }
    for (const srv of st.servers) {
      if (srv.error)
        console.error(
          theme.warn(
            t('mcp.server_error', { name: srv.name, error: srv.error }),
          ),
        )
    }
  } catch (e) {
    console.error(theme.warn(t('mcp.load_failed', { v: (e as Error).message })))
  }

  const browser = new DeepSeekBrowser({
    headless,
    debug,
    channel: config.browserChannel,
    ...config.browser,
    locale: currentLocale,
    // Persist credentials the operator typed in the terminal so the next
    // launch can re-login silently after a logout.
    onAuthSave: (username, password) => {
      config.browser.auth.username = username
      config.browser.auth.password = password
      try {
        writeConfigValue('home', 'browser.auth.username', username)
        writeConfigValue('home', 'browser.auth.password', password)
      } catch {}
    },
  })

  const bootSpinner = mod.createSpinner(currentLocale)
  bootSpinner.thinking()

  try {
    await browser.launch()
    bootSpinner.stop()
    await browser.waitForLogin()
  } catch (e) {
    bootSpinner.stop()
    console.error(theme.error(t('msg.browser_error')), (e as Error).message)
    if (debug) console.error((e as Error).stack)
    await browser.close().catch(() => {})
    transcript.close()
    process.exit(1)
  }

  // One-shot mode
  if (task) {
    const tools = mod.createTools(currentWorkdir, { undo })
    if (mcpPool) tools.push(...mcpPool.tools)

    let freshChat = true
    let sendSystemPrompt = true

    // By default we start a new chat. To continue a previous session —
    // explicitly: --chat <id> or --resume-last.
    let resumeId = chatIdArg
    if (!resumeId && resumeLastFlag && !newChatFlag) {
      const last = loadLastSession(currentWorkdir)
      if (last && last.id) {
        resumeId = last.id
        console.log(theme.system(t('msg.resuming', { id: resumeId })))
      }
    }

    if (resumeId) {
      try {
        console.log(theme.system(t('msg.opening_chat', { id: resumeId })))
        await browser.openChat(resumeId)
        freshChat = false
        sendSystemPrompt =
          resendPrompt || config.browser.resendPromptOnResume === true
        saveLastChat(resumeId, currentWorkdir)
      } catch (e) {
        console.error(
          theme.error(t('msg.open_chat_error', { v: (e as Error).message })),
        )
      }
    }

    await autoReload()

    await runTask(browser, tools, task, currentWorkdir, {
      transcript,
      freshChat,
      sendSystemPrompt,
      onChatReady: (chatId) => {
        if (chatId) saveLastChat(chatId, currentWorkdir)
      },
    })
    await browser.close()
    await mod.closeWeb().catch(() => {})
    if (mcpPool) await mcpPool.close().catch(() => {})
    transcript.close()
    return
  }

  console.log(theme.system(t('msg.interactive')))
  console.log(theme.system(t('msg.queue_hint')))

  let freshChatNext = true
  let sendSystemPromptNext = true
  // Resuming an existing chat already has the system-prompt at its start, so
  // resending it is wasteful and pollutes the context. Default: do NOT resend.
  // `--resend-prompt` or `browser.resendPromptOnResume` forces it (e.g. when
  // the prompt/tools changed).
  const promptOnResume = (): boolean =>
    resendPrompt || config.browser.resendPromptOnResume === true
  let lastChats: ChatInfo[] = []
  let currentChatId: string | null = null
  let running = true
  // Long-lived session goal (set via /goal). Prepended to every task message so
  // the model keeps the big picture across many turns. Persisted per working
  // directory in <project>/.zames-goal (best-effort); restored right away.
  let sessionGoal: string | null = await loadGoal(currentWorkdir)
  if (sessionGoal) {
    console.log(theme.system(t('goal.loaded', { goal: sessionGoal })))
  }

  // Scheduled tasks (/loop, /cron). A pure Scheduler holds the jobs; a
  // 1-second ticker enqueues a due job's task into the SAME message queue the
  // operator uses, so it runs when the agent is free (never mid-generation,
  // never bypassing the send throttle). Started lazily on the first job.
  const scheduler = new Scheduler()
  let scheduleTimer: ReturnType<typeof setInterval> | null = null
  const startScheduleTicker = (): void => {
    if (scheduleTimer) return
    scheduleTimer = setInterval(() => {
      const due = scheduler.due(Date.now())
      for (const job of due) {
        pendingQueue.push({ text: job.task })
        transcript.log('scheduled_fire', { id: job.id, task: job.task })
        if (editor) {
          editor.printAbove(
            theme.system(
              t('sched.fired', { id: String(job.id), task: job.task }),
            ),
          )
        } else {
          console.log(
            theme.system(
              t('sched.fired', { id: String(job.id), task: job.task }),
            ),
          )
        }
        // Wake a waiting main loop so a queued job runs even when idle.
        if (waiter) {
          const r = waiter
          waiter = null
          r(pendingQueue.shift() ?? null)
        }
      }
    }, 1000)
    if (scheduleTimer.unref) scheduleTimer.unref()
  }

  // Messages the user typed while the agent worked. runTask takes them one
  // by one after the current task finishes.
  const pendingQueue: PendingMessage[] = []
  // Show the "no clipboard image" hint only once per session.
  let clipboardWarned = false
  // Show the "message is queued" hint once per session (the first time the
  // operator sends while a task runs), so the queue is understood without
  // spamming the hint on every queued message.
  let queueHintShown = false
  // Timestamp of the last Ctrl+C while the agent was busy. Two presses
  // within 2s escalate from "abort the running tool" to "stop the whole run".
  let lastCtrlCAt = 0

  // ---------- review mode state ----------
  // null — normal mode.
  // { snapDir, snapName, originalWorkdir } — we're inside a snapshot, the chat
  // is already initialized with the review prompt, the user can just type "fix...".
  let reviewMode: ReviewMode | null = null

  process.on('SIGINT', async () => {
    running = false
    await browser.close().catch(() => {})
    // Close the lazy headless browser from web.js, otherwise it would stay
    // as a separate process after the agent exits.
    await mod.closeWeb().catch(() => {})
    if (mcpPool) await mcpPool.close().catch(() => {})
    transcript.close()
    console.log(
      theme.dim(
        t('msg.exit_summary', {
          transcript: transcript.file || t('common.off'),
          chat: currentChatId || t('chats.not_created'),
        }),
      ),
    )
    console.log(theme.system(String.fromCharCode(10) + t('msg.bye')))
    process.exit(0)
  })

  // By default we start a NEW chat on launch: the context of a previous
  // session is not carried over automatically. To continue a previous
  // session explicitly:
  //   --chat <id>     open a specific chat
  //   --resume-last   return to the last chat for this working directory
  //   --new-chat      kept for compatibility (this is the default behavior)
  let resumeId = chatIdArg
  if (!resumeId && resumeLastFlag && !newChatFlag) {
    const last = loadLastSession(currentWorkdir)
    if (last && last.id) {
      resumeId = last.id
      console.log(
        theme.system(
          t('msg.resuming', {
            id: last.id + (last.title ? ` (${last.title})` : ''),
          }),
        ),
      )
    }
  }

  if (resumeId) {
    try {
      console.log(theme.system(t('msg.opening_chat', { id: resumeId })))
      await browser.openChat(resumeId)
      currentChatId = resumeId
      freshChatNext = false
      sendSystemPromptNext = promptOnResume()
      saveLastChat(resumeId, currentWorkdir)
      console.log(
        theme.system(
          t('msg.chat_opened') + ' ' + resumeId + String.fromCharCode(10),
        ),
      )
      await printRestoredHistory(browser, null, resumeId)
    } catch (e) {
      console.error(
        theme.error(t('msg.open_chat_error', { v: (e as Error).message })),
      )
    }
  }

  // ---------- input: permanent line below + status above ----------
  // In TTY we use LineEditor: it owns the input all the time, shows the
  // status above the input line and prints the agent's answers ABOVE it, so
  // the typed text is never overwritten by output. In non-TTY (pipe) —
  // the old promptOnce.
  let editor: LineEditor | null = null
  let waiter: ((v: PendingMessage | null) => void) | null = null
  const takeInput = (): Promise<PendingMessage | null> => {
    if (pendingQueue.length)
      return Promise.resolve(pendingQueue.shift() ?? null)
    return new Promise<PendingMessage | null>((resolve) => {
      waiter = resolve
    })
  }

  const buildPrompt = () => {
    let tail
    if (reviewMode) {
      tail =
        theme.warn(t('prompt.review')) +
        theme.dim(':') +
        theme.dir(reviewMode.snapName)
    } else {
      tail = theme.dir(dirLabel(currentWorkdir))
    }
    return theme.prompt('❯ ') + tail + theme.dim(' › ')
  }

  await refreshDynamicCommands(currentWorkdir)

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const ed = new LineEditor({
      prompt: buildPrompt(),
      commands: buildSlashCommands(),
      locale: currentLocale,
    })
    editor = ed
    ed.setTmpDir(TMP_DIR)
    // The token context right-aligned on the status line (above the input).
    // The editor pulls the number on every render, so it follows the live
    // DeepSeek counter (accumulated_token_usage) without a polling timer.
    ed.onContextQuery = () => browser.getLastTokenUsage()
    // Queue badge: show "⧗N" while messages are waiting to be sent after the
    // current task. Pulled on every render (like the context counter).
    ed.onQueueQuery = () => pendingQueue.length
    // Use the configured context window for the fill percentage/color.
    ed.setContextLimit(config.ui.contextLimit)
    // Toggle icons (🧠 deep thinking, 🌐 web search) before the context
    // counter. The editor pulls the live state on every render.
    ed.onToggleQuery = () => browser.getToggleStatesSync()
    ed.onAttach = async (raw: string) => {
      // Case 1: the paste is the image data itself (data URL / base64 blob).
      const image = parseImagePaste(raw)
      if (image) {
        const name = 'paste' + extForMime(image.mime)
        const p = await saveToTemp(TMP_DIR, name, image.data)
        const att = ed.attachments.add({
          path: p,
          name,
          mime: image.mime,
          size: image.data.length,
        })
        ed.printAbove(
          theme.system(
            t('msg.attached_image', {
              marker: att.marker,
              size: formatSize(image.data.length),
              path: p,
            }),
          ),
        )
        return att
      }
      // Case 2: the paste is a path to a local file (drag&drop or copy path).
      const filePath = await resolveAttachPath(currentWorkdir, raw)
      if (!filePath) return null
      const data = await fs.readFile(filePath).catch(() => null)
      if (!data) return null
      const name = path.basename(filePath)
      const mime = guessMime(name)
      const att = ed.attachments.add({
        path: filePath,
        name,
        mime,
        size: data.length,
      })
      ed.printAbove(
        theme.system(
          t('msg.attached_file', {
            marker: att.marker,
            name,
            size: formatSize(data.length),
            path: filePath,
          }),
        ),
      )
      return att
    }
    ed.onClipboard = async () => {
      const res = await readClipboardImageDetailed()
      if (!res.data || !res.data.length) {
        // On WSL the user may have copied a FILE in Windows (not an image):
        // the Windows clipboard holds its path - attach it directly.
        for (const fp of readWindowsClipboardFiles()) {
          const data = await fs.readFile(fp).catch(() => null)
          if (!data) continue
          const nm = path.basename(fp)
          const att = ed.attachments.add({
            path: fp,
            name: nm,
            mime: guessMime(nm),
            size: data.length,
          })
          ed.printAbove(
            theme.system(
              t('msg.attached_file', {
                marker: att.marker,
                name: nm,
                size: formatSize(data.length),
                path: fp,
              }) + theme.dim(' (windows-clipboard)'),
            ),
          )
          return att
        }
        if (!clipboardWarned) {
          clipboardWarned = true
          ed.printAbove(
            theme.warn(
              t('msg.clip_empty', { via: res.via }) +
                String.fromCharCode(10) +
                (process.platform === 'linux' && !hasClipboardTool()
                  ? t('msg.clip_container')
                  : t('msg.clip_hint')),
            ),
          )
        }
        return null
      }
      const mime = sniffMime(res.data) || 'image/png'
      const name = 'clipboard-' + Date.now() + (extForMime(mime) || '.png')
      const p = await saveToTemp(TMP_DIR, name, res.data)
      const att = ed.attachments.add({
        path: p,
        name,
        mime,
        size: res.data.length,
      })
      ed.printAbove(
        theme.system(
          t('msg.attached_image', {
            marker: att.marker,
            size: formatSize(res.data.length),
            path: p,
          }) + theme.dim('  (' + res.via + ')'),
        ),
      )
      return att
    }
    ed.onSubmit = (text: string, items) => {
      // While the agent is busy the main command loop is blocked on
      // `await runTask()`, so ONLY commands that make sense without the main
      // loop are handled here (a queued slash-command would run too late).
      if (ed.busy) {
        const q = parseQueueCommand(text)
        if (q) {
          if (q.sub === 'clear') {
            const n = pendingQueue.length
            pendingQueue.length = 0
            ed.printAbove(theme.system(t('msg.queue_cleared') + ' (' + n + ')'))
          } else if (!pendingQueue.length) {
            ed.printAbove(theme.dim(t('msg.queue_empty')))
          } else {
            ed.printAbove(theme.system(t('msg.queue_title')))
            for (const line of formatQueueList(pendingQueue)) {
              ed.printAbove(theme.assistant(line))
            }
            ed.printAbove(theme.dim(t('msg.queue_cleared_hint')))
          }
          return
        }
        // Toggle Deep thinking / Smart search LIVE. This only flips the
        // browser's DESIRED state and the status icons; it does not touch the
        // in-flight generation, so it is safe mid-run. The actual DeepSeek
        // toggles are applied on the next send by _applyToggles().
        const tg = parseLiveToggle(text)
        if (tg) {
          applyLiveToggle(tg)
          return
        }
        // `/config <sub>` text commands (list/get/set/reset/lang) are safe
        // mid-run: they only touch config values, never the chat. The
        // interactive menu (`/config` bare or `menu`) is NOT intercepted —
        // it pauses the editor and would fight the running task, so it stays
        // queued. `setConfigRuntime` already applies hot values (locale,
        // toggles, context limit) to the live objects immediately.
        if (isLiveConfigCommand(text)) {
          void handleConfigCommand(text)
          return
        }
        // `/goal` is safe mid-run: it only sets a variable and writes a file.
        if (/^\/goal(\s|$)/i.test(text.trim())) {
          void handleGoal(text)
          return
        }
      }
      const attachments = (items || []).map((a) => ({
        path: a.path,
        name: a.name,
        mime: a.mime,
      }))
      const msg: PendingMessage = { text, attachments }
      pendingQueue.push(msg)
      // The operator typed this WHILE the agent was working, so the message is
      // queued and only sent after the current task. Explain that once per
      // session (via the editor's own status area) so it is clear nothing was
      // lost; later queued messages stay as the compact msg.queued banner only.
      if (ed.busy && !queueHintShown) {
        queueHintShown = true
        ed.printAbove(theme.dim(t('msg.queued_hint')))
      }
      if (waiter) {
        const r = waiter
        waiter = null
        r(pendingQueue.shift() ?? null)
      }
    }
    ed.onEscape = () => {
      if (ed.busy) {
        ed.printAbove(theme.warn(t('msg.abort_gen_short')))
        browser.stopGeneration().catch(() => {})
      }
    }
    ed.onCtrlC = () => {
      if (ed.busy) {
        // A running tool can be long (npm test, a big build). The FIRST
        // Ctrl+C aborts just the TOOL (sets browser._abort, which the tool's
        // AbortSignal follows and which makes the loop drop the tool result).
        // A SECOND Ctrl+C within 2s is an explicit "stop the whole run"
        // (sets _stopped, which also halts the queue). This makes the two
        // intents distinguishable instead of one press doing everything.
        const now = Date.now()
        if (ctrlCEscalation(now - lastCtrlCAt) === 'run') {
          ed.printAbove(theme.warn(t('msg.abort_ctrlc_short')))
          browser.stopGeneration().catch(() => {})
        } else {
          ed.printAbove(theme.warn(t('msg.abort_tool_short')))
          browser._abort = true
        }
        lastCtrlCAt = now
      } else {
        // Not busy — exit. We wake takeInput() so the loop finishes.
        running = false
        if (waiter) {
          const r = waiter
          waiter = null
          r(null)
        }
      }
    }
    ed.start()

    // All command output (console.log/error) must go ABOVE the input line,
    // otherwise it overwrites the text being typed. While the editor is
    // active, we wrap both streams in ed.printAbove.
    const origLog = console.log.bind(console)
    const origErr = console.error.bind(console)
    const fmt = (a: unknown): string =>
      typeof a === 'string'
        ? a
        : (() => {
            try {
              return JSON.stringify(a)
            } catch {
              return String(a)
            }
          })()
    console.log = (...a) => ed.printAbove(a.map(fmt).join(' '))
    console.error = (...a) => ed.printAbove(a.map(fmt).join(' '))
    // Save for debugging.
    const edAny = ed as unknown as Record<string, unknown>
    edAny._origLog = origLog
    edAny._origErr = origErr
  }

  // ---------- /config ----------
  // View and edit settings without a restart. Values are validated against
  // CONFIG_SCHEMA (src/config.ts) and written to the project .zamesrc.json.
  // The language (ui.locale) is applied immediately: we change currentLocale,
  // rebuild the editor hints and update config.ui.locale (agent-loop reads it
  // on the next task).
  //
  // With no arguments in an interactive terminal a menu opens (arrows,
  // Enter — edit, d — reset, q — quit). There are also text subcommands
  // (list/get/set/reset/lang/path) — for scripts and non-TTY.
  function setConfigRuntime(path: string, value: unknown): void {
    const segs = path.split('.')
    let obj: Record<string, unknown> = config as unknown as Record<
      string,
      unknown
    >
    for (let i = 0; i < segs.length - 1; i++) {
      obj = obj[segs[i]] as Record<string, unknown>
    }
    obj[segs[segs.length - 1]] = value
    if (path === 'ui.locale' && isLocale(value)) {
      currentLocale = value
      config.ui.locale = value
      if (editor) {
        editor.setLocale(value)
        editor.setCommands(buildSlashCommands())
        editor.setPrompt(buildPrompt())
      }
    }
    // Reflect browser toggles on the LIVE browser object. The browser is
    // created once at startup, so without this a /config set browser.*
    // change would only apply after a restart. We also update the cached
    // toggle states (_toggles) that the status icons read, and repaint the
    // editor, so the 🧠/🌐 icons change IMMEDIATELY (previously they only
    // updated after the next send, when _applyToggles() ran).
    if (path === 'browser.deepThinking' || path === 'browser.webSearch') {
      const b = browser as unknown as {
        deepThinking: boolean
        webSearch: boolean
        setToggleState: (s: {
          deepThinking?: boolean
          webSearch?: boolean
        }) => void
      }
      if (path === 'browser.deepThinking') b.deepThinking = !!value
      else b.webSearch = !!value
      b.setToggleState({
        deepThinking: b.deepThinking,
        webSearch: b.webSearch,
      })
      if (editor) editor.refreshStatus()
    }
    // The context window size feeds the status-bar percentage and its color.
    // Apply it to the live editor immediately (the value is a plain number,
    // no restart needed).
    if (path === 'ui.contextLimit' && typeof value === 'number') {
      if (editor) {
        editor.setContextLimit(value)
        editor.refreshStatus()
      }
    }
  }

  // Apply `/thinking` / `/web` immediately: flip the browser's DESIRED state
  // and the status icons, and persist to config (so it survives a restart).
  // The DeepSeek toggles themselves are clicked on the next send by
  // _applyToggles(), so this is safe even while a generation is in flight.
  function applyLiveToggle(cmd: {
    kind: 'thinking' | 'search'
    mode: string
  }): void {
    const b = browser as unknown as {
      deepThinking: boolean
      webSearch: boolean
      setToggleState: (s: {
        deepThinking?: boolean
        webSearch?: boolean
      }) => void
    }
    const cur = cmd.kind === 'thinking' ? b.deepThinking : b.webSearch
    const next = cmd.mode === 'toggle' ? !cur : cmd.mode === 'on'
    if (cmd.kind === 'thinking') b.deepThinking = next
    else b.webSearch = next
    b.setToggleState({
      deepThinking: b.deepThinking,
      webSearch: b.webSearch,
    })
    const cfgPath =
      cmd.kind === 'thinking' ? 'browser.deepThinking' : 'browser.webSearch'
    try {
      writeConfigValue('home', cfgPath, String(next))
      setConfigRuntime(cfgPath, next)
    } catch {
      // A failed persist must not break the toggle itself.
    }
    if (editor) editor.refreshStatus()
    const label =
      cmd.kind === 'thinking' ? t('toggle.thinking') : t('toggle.search')
    const stateText = next ? t('common.on') : t('common.off')
    const line = t('toggle.set', { name: label, state: stateText })
    if (editor) editor.printAbove(theme.system(line))
    else console.log(theme.system(line))
  }

  // Handle a `/goal` command shared by the main loop and the live interception
  // (so a goal can be set even while the agent is busy — it only touches a
  // variable and a file, never the chat). Output goes above the input line
  // when the editor is active, otherwise to stdout.
  async function handleGoal(input: string): Promise<void> {
    const g = parseGoalCommand(input)
    if (!g) return
    const emit = (line: string): void => {
      if (editor) editor.printAbove(line)
      else console.log(line)
    }
    if (g.sub === 'clear') {
      sessionGoal = null
      await saveGoal(currentWorkdir, null)
      emit(theme.system(t('goal.cleared')))
    } else if (g.sub === 'show') {
      emit(
        sessionGoal
          ? theme.system(t('goal.current', { goal: sessionGoal }))
          : theme.dim(t('goal.none')),
      )
    } else {
      sessionGoal = g.goal
      await saveGoal(currentWorkdir, g.goal)
      emit(theme.system(t('goal.set', { goal: g.goal })))
    }
  }

  function configSetRaw(field: ConfigField, raw: string): void {
    const value = validateConfigValue(field, raw)
    writeConfigValue('home', field.path, raw)
    setConfigRuntime(field.path, value)
  }
  function configResetField(field: ConfigField): void {
    resetConfigValue('home', field.path)
    // Reset the runtime value to the default.
    const def = getByPath(DEFAULTS, field.path)
    setConfigRuntime(field.path, def)
  }

  function configLabel(field: ConfigField): string {
    return t(field.labelKey)
  }

  function configShowList(): void {
    console.log(theme.system(t('cfg.title')))
    let lastGroup = ''
    for (const f of CONFIG_SCHEMA) {
      const g = t(f.groupKey)
      if (g !== lastGroup) {
        console.log(theme.system('\n  ' + g))
        lastGroup = g
      }
      const cur = getByPath(config, f.path)
      const shown =
        cur === undefined
          ? t('cfg.menu.default')
          : typeof cur === 'boolean'
            ? cur
              ? t('common.on')
              : t('common.off')
            : /password/i.test(f.path) && String(cur).length > 0
              ? '********'
              : JSON.stringify(cur)
      const extra = f.values ? '  [' + f.values.join('|') + ']' : ''
      console.log(
        '    ' +
          theme.user(f.path) +
          theme.dim(' = ') +
          theme.assistant(shown) +
          theme.dim(extra) +
          theme.dim('   # ' + configLabel(f)),
      )
    }
    console.log(theme.dim('\n' + t('cfg.usage')))
  }

  async function configOpenMenu(): Promise<void> {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) {
      configShowList()
      return
    }
    // The menu draws directly to stdout and reads keys itself. So that its
    // output doesn't overlap the LineEditor's permanent input line, we "pause"
    // the editor for the duration of the menu and restore it afterwards.
    if (editor) editor.pause()
    try {
      await runConfigMenu({
        fields: CONFIG_SCHEMA,
        t,
        get: (path) => getByPath(config, path),
        set: (field, raw) => configSetRaw(field, raw),
        reset: (field) => configResetField(field),
      })
    } catch (e) {
      console.error(theme.error(String((e as Error).message || e)))
    } finally {
      if (editor) editor.resume()
    }
  }

  async function handleConfigCommand(input: string): Promise<void> {
    const parts = input.trim().split(/\s+/)
    const sub = (parts[1] || '').toLowerCase()

    // With no subcommand — the menu (or a text list in non-TTY).
    if (!sub || sub === 'menu' || sub === 'ui') {
      await configOpenMenu()
      return
    }

    if (sub === 'list' || sub === 'show' || sub === 'ls') {
      configShowList()
      return
    }

    if (sub === 'path' || sub === 'paths') {
      console.log(
        theme.system(
          t('cfg.paths', {
            global: CONFIG_PATHS.HOME_CONFIG,
            project: CONFIG_PATHS.PROJECT_CONFIG,
          }),
        ),
      )
      return
    }

    // /config lang <ru|en> — quick access to ui.locale
    if (sub === 'lang' || sub === 'language' || sub === 'язык') {
      const val = parts[2]
      if (!val) {
        console.log(
          theme.system(
            t('status.locale', { v: localeDisplayName(currentLocale) }),
          ),
        )
        console.log(theme.dim(t('cfg.lang_usage')))
        return
      }
      const field = CONFIG_SCHEMA.find((f) => f.path === 'ui.locale')!
      const loc = normalizeLocale(val)
      try {
        configSetRaw(field, loc)
      } catch (e) {
        console.error(
          theme.error(t('cfg.write_error', { v: (e as Error).message })),
        )
        return
      }
      console.log(
        theme.assistant(t('cfg.lang_set', { v: localeDisplayName(loc) })),
      )
      return
    }

    if (sub === 'get') {
      const key = parts[2]
      if (!key) {
        console.log(theme.dim(t('cfg.usage')))
        return
      }
      const field = CONFIG_SCHEMA.find((f) => f.path === key)
      if (!field) {
        console.error(theme.error(t('cfg.unknown_key', { v: key })))
        return
      }
      const cur = getByPath(config, key)
      console.log(
        theme.system(
          t('cfg.value', {
            v: key,
            value:
              cur === undefined
                ? t('cfg.menu.default')
                : /password/i.test(key) && String(cur).length > 0
                  ? '********'
                  : JSON.stringify(cur),
          }),
        ),
      )
      return
    }

    if (sub === 'set') {
      const key = parts[2]
      const raw = parts.slice(3).join(' ')
      const field = CONFIG_SCHEMA.find((f) => f.path === key)
      if (!field) {
        console.error(theme.error(t('cfg.unknown_key', { v: key || '' })))
        return
      }
      if (!raw) {
        console.log(theme.dim(t('cfg.usage')))
        return
      }
      try {
        configSetRaw(field, raw)
      } catch {
        console.error(
          theme.error(
            t('cfg.bad_value', {
              v: key,
              type: field.values ? field.values.join('|') : field.type,
            }),
          ),
        )
        return
      }
      console.log(
        theme.assistant(
          t('cfg.saved', {
            v: key,
            value: JSON.stringify(getByPath(config, key)),
            file: CONFIG_PATHS.HOME_CONFIG,
          }),
        ),
      )
      return
    }

    if (sub === 'reset' || sub === 'unset') {
      const key = parts[2]
      const field = CONFIG_SCHEMA.find((f) => f.path === key)
      if (!field) {
        console.error(theme.error(t('cfg.unknown_key', { v: key || '' })))
        return
      }
      try {
        configResetField(field)
      } catch (e) {
        console.error(
          theme.error(t('cfg.write_error', { v: (e as Error).message })),
        )
        return
      }
      console.log(theme.assistant(t('cfg.reset', { v: key })))
      return
    }

    // Unknown subcommand — show the list.
    console.error(theme.error(t('cfg.unknown_key', { v: sub })))
    configShowList()
  }

  while (running) {
    let input: string | null
    let inputAttachments: Array<{ path: string; name: string; mime: string }> =
      []
    try {
      if (editor) {
        editor.setPrompt(buildPrompt())
        const msg = await takeInput()
        input = msg ? msg.text : null
        inputAttachments = msg?.attachments || []
      } else {
        let tail
        if (reviewMode) {
          tail =
            theme.warn(t('prompt.review')) +
            theme.dim(':') +
            theme.dir(reviewMode.snapName)
        } else {
          tail = theme.dir(dirLabel(currentWorkdir))
        }
        input = await promptOnce(theme.prompt('❯ ') + tail + theme.dim(' › '))
      }
    } catch {
      break
    }

    const trimmed = (input || '').trim()
    if (!trimmed) continue

    const lower = trimmed.toLowerCase()

    if (['/exit', '/quit', 'exit', 'quit'].includes(lower)) break

    if (lower === '/help' || lower === 'help') {
      printHelp()
      continue
    }

    if (['/new', '/clear', 'new'].includes(lower)) {
      if (editor) editor.lock(t('msg.input_locked'))
      try {
        await browser.newChat()
        freshChatNext = false
        sendSystemPromptNext = true
        currentChatId = await browser.getCurrentChatId()
        saveLastChat(currentChatId, currentWorkdir)
        transcript.log('new_chat')
        // Start the new chat on a clean screen (like /clear in a shell).
        if (editor) editor.clearScreen()
        console.log(theme.system(t('msg.new_chat')))
        console.log(
          theme.system(t('msg.new_chat_ok') + String.fromCharCode(10)),
        )
      } catch (e) {
        console.error(
          theme.error(t('msg.new_chat_error', { v: (e as Error).message })),
          (e as Error).message,
        )
      } finally {
        if (editor) editor.unlock()
      }
      continue
    }

    // ---------- Self-review ----------

    if (lower === '/self-review' || lower.startsWith('/self-review ')) {
      const focus = trimmed.slice('/self-review'.length).trim()

      // Remember where to return
      const originalWorkdir: string = reviewMode
        ? reviewMode.originalWorkdir
        : currentWorkdir

      if (editor) editor.lock(t('msg.input_locked'))
      try {
        const result = await mod.selfReview({
          browser,
          config,
          focus: focus || undefined,
          transcript,
        })

        // Switch to review mode:
        //  - working directory = snapshot
        //  - we do NOT reset the chat — inside selfReview a fresh chat was
        //    already created and the review prompt sent, we continue in it
        reviewMode = {
          snapDir: result.snapDir,
          snapName: path.basename(result.snapDir),
          originalWorkdir,
        }
        currentWorkdir = result.snapDir
        freshChatNext = false
        sendSystemPromptNext = false
        currentChatId = await browser.getCurrentChatId()
        saveLastChat(currentChatId, currentWorkdir)

        console.log(
          theme.user(t('self.review_hint', { name: reviewMode.snapName })),
        )
      } catch (e) {
        console.error(
          theme.error(t('self.review_failed')),
          (e as Error).message,
        )
        if (debug) console.error((e as Error).stack)
      } finally {
        if (editor) editor.unlock()
      }
      continue
    }

    if (lower === '/self-fix' || lower.startsWith('/self-fix ')) {
      const rest = trimmed.slice('/self-fix'.length).trim()
      if (!rest) {
        console.error(theme.error(t('self.fix_usage')))
        continue
      }
      const sp = rest.indexOf(' ')
      const name = sp === -1 ? rest : rest.slice(0, sp)
      const focus = sp === -1 ? '' : rest.slice(sp + 1).trim()

      const snapRoot = path.join(ZAMES_HOME, 'snapshots', name)
      const stat = await fs.stat(snapRoot).catch(() => null)
      if (!stat || !stat.isDirectory()) {
        console.error(
          theme.error(t('self.snapshot_not_found', { v: snapRoot })),
        )
        continue
      }

      const originalWorkdir: string = reviewMode
        ? reviewMode.originalWorkdir
        : currentWorkdir

      // Fresh chat + review prompt for this snapshot
      try {
        const { runAgentLoop: ral } = await import('./agent-loop.js')
        const tools = mod.createTools(snapRoot, { undo: null })

        await browser.newChat()
        const sysPrompt = mod.buildSystemPrompt({
          workdir: snapRoot,
          tools,
          locale: currentLocale,
        })
        console.log(theme.system(t('self.init_review_chat')))
        await browser.ask(sysPrompt, { timeout: 60_000 })

        if (focus) {
          const ui = mod.createSpinner(currentLocale)
          ui.thinking()
          await ral({
            browser,
            tools,
            task: focus,
            workdir: snapRoot,
            maxIterations: maxIter,
            freshChat: false,
            sendSystemPrompt: false,
            transcript,
            onThinking: () => ui.thinking(),
            onToolCall: (name, toolArgs) => ui.toolCall(name, toolArgs),
            onToolResult: (r) => ui.toolResult(r),
            onAssistantMessage: (m) => {
              ui.assistant(m)
            },
            onWarning: (m) => ui.warning(m),
            locale: currentLocale,
          })
        }

        reviewMode = {
          snapDir: snapRoot,
          snapName: name,
          originalWorkdir,
        }
        currentWorkdir = snapRoot
        freshChatNext = false
        sendSystemPromptNext = false
        currentChatId = await browser.getCurrentChatId()
        saveLastChat(currentChatId, currentWorkdir)

        console.log(theme.user(t('self.fix_hint', { name })))
      } catch (e) {
        console.error(theme.error(t('self.enter_failed')), (e as Error).message)
      }
      continue
    }

    if (lower === '/self-done') {
      if (!reviewMode) {
        console.log(theme.system(t('self.not_in_review')))
        continue
      }
      const back = reviewMode.originalWorkdir
      reviewMode = null
      currentWorkdir = back
      // Since the chat is busy with the review context, we'll create a new one for regular work
      freshChatNext = true
      sendSystemPromptNext = true
      console.log(theme.system(t('self.done_hint', { v: back })))
      continue
    }

    if (lower === '/self-list') {
      try {
        await mod.selfList({ config })
      } catch (e) {
        console.error(theme.error(t('msg.error')), (e as Error).message)
      }
      continue
    }

    if (lower === '/self-diff' || lower.startsWith('/self-diff ')) {
      const name = trimmed.slice('/self-diff'.length).trim()
      if (!name) {
        console.error(theme.error(t('self.diff_usage')))
        continue
      }
      try {
        await mod.selfDiff({ config, name })
      } catch (e) {
        console.error(theme.error(t('msg.error')), (e as Error).message)
      }
      continue
    }

    if (lower === '/self-apply' || lower.startsWith('/self-apply ')) {
      const name = trimmed.slice('/self-apply'.length).trim()
      if (!name) {
        console.error(theme.error(t('self.apply_usage')))
        continue
      }
      try {
        await mod.selfApply({ config, name })
      } catch (e) {
        console.error(theme.error(t('msg.error')), (e as Error).message)
      }
      continue
    }

    // ---------- Regular commands ----------

    if (lower === '/chats') {
      const spin = editor || mod.createSpinner(currentLocale)
      if (editor) editor.lock(t('msg.input_locked'))
      spin.thinking()
      try {
        lastChats = await browser.listChats(30)
        spin.stop()
        if (!lastChats.length) {
          console.log(theme.system(t('chats.none_hint')))
        } else {
          console.log(theme.system(t('chats.recent')))
          lastChats.forEach((c, i) => {
            const n = String(i + 1).padStart(2, ' ')
            console.log(
              `  ${theme.user(n)}. ${c.title}  ${theme.system('(' + c.id.slice(0, 8) + '…)')}`,
            )
          })
          console.log(theme.system(t('chats.use_resume')))
        }
      } catch (e) {
        spin.stop()
        console.error(theme.error(t('chats.fetch_error')), (e as Error).message)
      } finally {
        if (editor) editor.unlock()
      }
      continue
    }

    if (lower === '/resume' || lower.startsWith('/resume ')) {
      const arg = trimmed.slice(7).trim()
      if (!arg) {
        console.error(theme.error(t('chats.resume_usage')))
        continue
      }
      const n = Number(arg)
      if (!Number.isFinite(n) || n < 1) {
        console.error(theme.error(t('chats.need_number')))
        continue
      }
      if (!lastChats.length) {
        console.error(theme.error(t('chats.run_chats_first')))
        continue
      }
      const pick = lastChats[n - 1]
      if (!pick) {
        console.error(
          theme.error(t('chats.no_n', { n, total: lastChats.length })),
        )
        continue
      }

      if (editor) editor.lock(t('msg.input_locked'))
      try {
        await browser.openChat(pick.id)
        currentChatId = pick.id
        freshChatNext = false
        sendSystemPromptNext = promptOnResume()
        saveLastChat(pick.id, currentWorkdir, pick.title)
        transcript.log('resume_chat', { id: pick.id, title: pick.title })
        // Resume on a clean screen so the restored dialogue is readable.
        if (editor) editor.clearScreen()
        console.log(theme.system(t('chats.opening', { v: pick.title })))
        console.log(
          theme.assistant(t('msg.chat_opened')) +
            theme.system(
              sendSystemPromptNext
                ? String.fromCharCode(10) + t('chats.prompt_will_resend')
                : String.fromCharCode(10) + t('chats.prompt_no_resend'),
            ),
        )
        await printRestoredHistory(browser, editor, pick.id)
      } catch (e) {
        console.error(
          theme.error(t('msg.open_chat_error', { v: '' })),
          (e as Error).message,
        )
      } finally {
        if (editor) editor.unlock()
      }
      continue
    }

    if (lower === '/chat') {
      if (currentChatId) {
        console.log(theme.system(t('chats.current_id', { v: currentChatId })))
        console.log(
          theme.system(
            `URL: https://chat.deepseek.com/a/chat/s/${currentChatId}`,
          ),
        )
      } else {
        const id = await browser.getCurrentChatId()
        console.log(
          theme.system(
            id ? t('chats.current_id', { v: id }) : t('chats.not_created'),
          ),
        )
      }
      continue
    }

    if (lower === '/sessions' || lower === '/session') {
      const all = listSessions()
      console.log(theme.system(t('sessions.dir', { v: sessionsDir() })))
      if (!all.length) {
        console.log(theme.system(t('sessions.none')))
      } else {
        all.forEach((s, i) => {
          const n = String(i + 1).padStart(2, ' ')
          const mark = s.id === currentChatId ? theme.user(' *') : ''
          const title = s.title ? `  ${s.title}` : ''
          const wd = s.workdir ? theme.dim(`  [${dirLabel(s.workdir)}]`) : ''
          console.log(
            `  ${theme.user(n)}. ${s.id.slice(0, 8)}…${title}${wd}${mark}`,
          )
        })
        console.log(theme.system(t('sessions.restore_hint')))
      }
      continue
    }

    if (lower.startsWith('/resume-id ')) {
      const id = trimmed.slice('/resume-id'.length).trim()
      if (!id) {
        console.error(theme.error(t('sessions.resume_id_usage')))
        continue
      }
      if (editor) editor.lock(t('msg.input_locked'))
      try {
        if (editor) editor.clearScreen()
        console.log(theme.system(t('msg.opening_chat', { id })))
        await browser.openChat(id)
        currentChatId = id
        freshChatNext = false
        sendSystemPromptNext = promptOnResume()
        saveLastChat(id, currentWorkdir)
        transcript.log('resume_chat', { id })
        console.log(
          theme.assistant(t('msg.chat_opened')) +
            theme.system(String.fromCharCode(10)),
        )
        await printRestoredHistory(browser, editor, id)
      } catch (e) {
        console.error(
          theme.error(t('msg.open_chat_error', { v: '' })),
          (e as Error).message,
        )
      } finally {
        if (editor) editor.unlock()
      }
      continue
    }

    if (lower === '/pwd') {
      console.log(theme.system(currentWorkdir))
      continue
    }

    if (lower === '/goal' || lower.startsWith('/goal ')) {
      await handleGoal(trimmed)
      continue
    }

    if (lower === '/loop' || lower.startsWith('/loop ')) {
      const rest = trimmed.slice('/loop'.length).trim()
      const sp = rest.indexOf(' ')
      const intervalStr = sp === -1 ? rest : rest.slice(0, sp)
      const taskStr = sp === -1 ? '' : rest.slice(sp + 1).trim()
      const ms = parseInterval(intervalStr)
      if (!ms || !taskStr) {
        console.error(theme.error(t('sched.loop_usage')))
        continue
      }
      const job = scheduler.addLoop(ms, taskStr, Date.now())
      startScheduleTicker()
      console.log(
        theme.system(
          t('sched.added', {
            id: String(job.id),
            when: formatInterval(ms),
            task: taskStr,
          }),
        ),
      )
      continue
    }

    if (lower === '/cron' || lower.startsWith('/cron ')) {
      const rest = trimmed.slice('/cron'.length).trim()
      // A cron expression is exactly 5 whitespace-separated fields; the task
      // is everything after them.
      const parts = rest.split(/\s+/)
      if (parts.length < 6) {
        console.error(theme.error(t('sched.cron_usage')))
        continue
      }
      const cronExpr = parts.slice(0, 5).join(' ')
      const taskStr = parts.slice(5).join(' ').trim()
      if (!parseCron(cronExpr) || !taskStr) {
        console.error(theme.error(t('sched.cron_usage')))
        continue
      }
      const job = scheduler.addCron(cronExpr, taskStr, Date.now())
      if (!job) {
        console.error(theme.error(t('sched.cron_usage')))
        continue
      }
      startScheduleTicker()
      const nextIn = formatInterval(Math.max(0, job.nextAt - Date.now()))
      console.log(
        theme.system(
          t('sched.added', {
            id: String(job.id),
            when: cronExpr + ' (in ~' + nextIn + ')',
            task: taskStr,
          }),
        ),
      )
      continue
    }

    if (lower === '/jobs' || lower.startsWith('/jobs ')) {
      const sub = trimmed.slice('/jobs'.length).trim().toLowerCase()
      if (sub === 'clear') {
        const n = scheduler.clear()
        if (scheduleTimer) {
          clearInterval(scheduleTimer)
          scheduleTimer = null
        }
        console.log(theme.system(t('sched.cleared', { n: String(n) })))
        continue
      }
      if (sub.startsWith('rm ') || sub.startsWith('remove ')) {
        const id = Number(sub.replace(/^(rm|remove)\s+/, ''))
        if (!Number.isInteger(id) || !scheduler.remove(id)) {
          console.error(theme.error(t('sched.rm_usage')))
          continue
        }
        if (!scheduler.count() && scheduleTimer) {
          clearInterval(scheduleTimer)
          scheduleTimer = null
        }
        console.log(theme.system(t('sched.removed', { id: String(id) })))
        continue
      }
      const jobs = scheduler.list()
      if (!jobs.length) {
        console.log(theme.dim(t('sched.none')))
        continue
      }
      console.log(theme.system(t('sched.title')))
      for (const j of jobs) {
        const when =
          j.kind === 'loop'
            ? 'every ' + formatInterval(j.intervalMs || 0)
            : j.cron || ''
        const nextIn = formatInterval(Math.max(0, j.nextAt - Date.now()))
        console.log(
          theme.assistant(
            '  #' + j.id + ' [' + when + ', next ~' + nextIn + '] ' + j.task,
          ),
        )
      }
      console.log(theme.dim(t('sched.remove_hint')))
      continue
    }

    if (lower === '/queue' || lower.startsWith('/queue ')) {
      const q = parseQueueCommand(trimmed)
      if (!q) {
        console.error(theme.error(t('msg.queue_usage')))
        continue
      }
      if (q.sub === 'clear') {
        const n = pendingQueue.length
        pendingQueue.length = 0
        console.log(theme.system(t('msg.queue_cleared') + ' (' + n + ')'))
        continue
      }
      if (!pendingQueue.length) {
        console.log(theme.dim(t('msg.queue_empty')))
        continue
      }
      console.log(theme.system(t('msg.queue_title')))
      for (const line of formatQueueList(pendingQueue)) {
        console.log(theme.assistant(line))
      }
      console.log(theme.dim(t('msg.queue_cleared_hint')))
      continue
    }

    if (lower.startsWith('/thinking') || lower.startsWith('/web')) {
      const tg = parseLiveToggle(trimmed)
      if (tg) {
        applyLiveToggle(tg)
        continue
      }
    }

    if (lower === '/mcp') {
      if (!mcpPool) {
        console.log(theme.dim(t('mcp.none')))
        console.log(theme.dim(t('mcp.hint')))
        continue
      }
      const st = mcpPool.status()
      console.log(theme.system(t('mcp.title', { n: String(st.toolCount) })))
      for (const srv of st.servers) {
        if (srv.error) {
          console.log(
            '  ' +
              theme.user(srv.name) +
              ' ' +
              theme.dim(t('mcp.status_error', { v: srv.error })),
          )
        } else {
          console.log(
            '  ' +
              theme.user(srv.name) +
              ' ' +
              theme.dim('(' + String(srv.tools.length) + ')'),
          )
        }
      }
      continue
    }
    if (lower === '/skills') {
      const { loadSkills } = await import('./context.js')
      const skills = await loadSkills(currentWorkdir)
      if (!skills.length) {
        console.log(theme.dim(t('skills.none')))
      } else {
        console.log(
          theme.system(t('skills.title', { n: String(skills.length) })),
        )
        for (const s of skills) {
          console.log(
            '  ' +
              theme.user('/' + s.name) +
              theme.dim(' [' + s.source + '] ') +
              (s.description || theme.dim(t('common.none'))),
          )
          console.log(theme.dim('      ' + s.path))
        }
      }
      continue
    }

    if (lower === '/memory') {
      const { loadProjectContext } = await import('./context.js')
      const ctx = await loadProjectContext(currentWorkdir)
      const show = (title: string, files: Array<{ path: string }>): void => {
        console.log(theme.system(title))
        if (!files.length) {
          console.log(theme.dim('  ' + t('common.none')))
          return
        }
        for (const f of files) console.log('  ' + f.path)
      }
      show(t('memory.agents'), ctx.agents)
      show(t('memory.memory'), ctx.memory)
      continue
    }

    if (lower === '/init' || lower.startsWith('/init ')) {
      const force = lower.includes('--force')
      const target = path.join(currentWorkdir, 'AGENTS.md')
      const exists = await fs.stat(target).catch(() => null)
      if (exists && !force) {
        console.log(theme.warn(t('init.overwrite', { v: target })))
        continue
      }
      // Like Codex: let the agent explore the project and write AGENTS.md via
      // the Write tool, so the file reflects the real build/test commands and
      // conventions instead of a static template.
      const initTask =
        'The user ran /init. Analyze this repository and create an AGENTS.md ' +
        'file at the project root that onboards future coding agents. Explore ' +
        'the project first (read the README, package.json and other manifests, ' +
        'configs, CI, and a sample of source files). Then write AGENTS.md with: ' +
        'an overview of what the project is; build/typecheck/test/lint commands ' +
        '(use the real scripts you find); code style and conventions; the repo ' +
        'layout; and any gotchas or rules an agent must follow. Keep it concise ' +
        'and factual, based only on what you find. Write the file with the Write ' +
        'tool, then reply via respond with a one-line summary.'

      const initTools = mod.createTools(currentWorkdir, { undo })
      if (editor) editor.busy = true
      console.log(theme.system(t('init.analyzing')))
      try {
        await mod.runAgentLoop({
          browser,
          tools: initTools,
          task: initTask,
          workdir: currentWorkdir,
          maxIterations: maxIter,
          freshChat: freshChatNext,
          sendSystemPrompt: sendSystemPromptNext,
          transcript,
          onThinking: () => {},
          onToolCall: (name, toolArgs) => {
            if (editor) editor.toolCall(name, toolArgs)
          },
          onToolResult: (r) => {
            if (editor) editor.toolResult(r)
          },
          onAssistantMessage: (m) => {
            if (editor) editor.assistant(m)
          },
          onWarning: (m) => {
            if (editor) editor.warning(m)
          },
          locale: currentLocale,
        })
      } catch (e) {
        console.error(theme.error(t('init.failed')), (e as Error).message)
      } finally {
        if (editor) editor.busy = false
      }

      freshChatNext = false
      sendSystemPromptNext = false
      if (!currentChatId) {
        currentChatId = await browser.getCurrentChatId()
      }
      saveLastChat(currentChatId, currentWorkdir)

      const created = await fs.stat(target).catch(() => null)
      if (created) {
        console.log(theme.assistant(t('init.done', { v: target })))
      } else {
        const stub =
          '# AGENTS.md\n\n' +
          'Project instructions for the coding agent. Describe the build/test commands, ' +
          'conventions, and any rules the agent must follow in this repository.\n\n' +
          '## Commands\n\n' +
          '- build: `...`\n' +
          '- test: `...`\n' +
          '- lint: `...`\n\n' +
          '## Conventions\n\n' +
          '- ...\n'
        await fs.writeFile(target, stub, 'utf-8')
        console.log(theme.warn(t('init.failed')))
        console.log(theme.assistant(t('init.created', { v: target })))
      }
      continue
    }

    if (lower === '/reload') {
      console.log(theme.system(t('msg.reload_start')))
      try {
        const { count, errors } = await reloadModules()
        if (errors.length) {
          console.error(theme.error(t('msg.reload_partial')))
          for (const e of errors) console.error(theme.error('  ' + e))
        } else {
          console.log(theme.assistant(t('msg.reloaded', { n: count })))
        }
      } catch (e) {
        console.error(theme.error(t('msg.reload_error')), (e as Error).message)
      }
      await autoReload()
      await refreshDynamicCommands(currentWorkdir)
      if (editor) editor.setCommands(buildSlashCommands())
      continue
    }

    if (lower === '/status') {
      const yes = t('common.yes')
      const no = t('common.no')
      console.log(theme.system(t('status.workdir', { v: currentWorkdir })))
      console.log(
        theme.system(
          t('status.review_mode', {
            v: reviewMode ? reviewMode.snapName : t('status.review_none'),
          }),
        ),
      )
      if (reviewMode) {
        console.log(
          theme.system(t('status.orig_dir', { v: reviewMode.originalWorkdir })),
        )
      }
      console.log(
        theme.system(
          t('status.chat', { v: currentChatId || t('common.none') }),
        ),
      )
      console.log(
        theme.system(t('status.fresh_next', { v: freshChatNext ? yes : no })),
      )
      console.log(
        theme.system(
          t('status.prompt_next', { v: sendSystemPromptNext ? yes : no }),
        ),
      )
      console.log(
        theme.system(
          t('status.last_chat', {
            v: loadLastChat(currentWorkdir) || t('common.none'),
          }),
        ),
      )
      console.log(theme.system(t('status.sessions', { v: sessionsDir() })))
      console.log(
        theme.system(
          t('status.dev', {
            v: devMode ? t('common.on') : t('common.off'),
          }),
        ),
      )
      console.log(theme.system(t('status.max_iter', { v: maxIter })))
      console.log(
        theme.system(t('status.headless', { v: headless ? yes : no })),
      )
      console.log(theme.system(t('status.debug', { v: debug ? yes : no })))
      const statusToggles = browser.getToggleStatesSync()
      console.log(
        theme.system(
          t('status.toggles', {
            think: statusToggles.deepThinking ? yes : no,
            search: statusToggles.webSearch ? yes : no,
          }),
        ),
      )
      console.log(
        theme.system(
          t('status.undo', {
            v: config.undo.enabled ? t('common.on') : t('common.off'),
          }),
        ),
      )
      console.log(
        theme.system(
          t('status.transcript', {
            v: transcript.file || t('common.off'),
          }),
        ),
      )
      console.log(
        theme.system(t('status.goal', { v: sessionGoal || t('common.none') })),
      )
      console.log(
        theme.system(
          t('status.locale', { v: localeDisplayName(currentLocale) }),
        ),
      )
      console.log(
        theme.system(
          t('status.mcp', {
            v: mcpPool ? String(mcpPool.status().toolCount) : t('common.none'),
          }),
        ),
      )
      const tokens = browser.getLastTokenUsage()
      console.log(
        theme.system(
          t('status.tokens', {
            v: tokens === null ? t('common.unknown') : String(tokens),
          }),
        ),
      )
      continue
    }

    if (lower === '/config' || lower.startsWith('/config ')) {
      await handleConfigCommand(trimmed)
      continue
    }

    if (lower === '/transcript') {
      console.log(theme.system(transcript.file || t('common.off')))
      continue
    }

    if (lower === '/diff' || lower.startsWith('/diff ')) {
      const staged = lower.indexOf('--staged') !== -1
      const { runGit } = await import('./gitTools.js')
      const probe = await runGit(
        'git rev-parse --is-inside-work-tree',
        currentWorkdir,
        5000,
      )
      if (probe.trim() !== 'true') {
        console.error(theme.error(t('diff.not_repo')))
        continue
      }
      const out = await runGit(diffGitArgs(staged), currentWorkdir, 20_000)
      console.log(theme.system(formatDiff(out, { maxLines: 400 })))
      continue
    }

    if (lower === '/cost' || lower === '/usage') {
      let stats = summarizeTranscript([])
      if (transcript.file) {
        try {
          const body = await fs.readFile(transcript.file, 'utf-8')
          stats = summarizeTranscript(parseTranscript(body))
        } catch {
          // best-effort
        }
      }
      console.log(
        theme.system(
          renderCost(stats, transcript.file, browser.getLastTokenUsage()),
        ),
      )
      continue
    }

    if (lower === '/export' || lower.startsWith('/export ')) {
      const arg = trimmed.slice('/export'.length).trim()
      const target = arg
        ? path.resolve(currentWorkdir, arg)
        : defaultExportPath(currentWorkdir)
      const rel = path.relative(sandboxRoot, target)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        console.error(theme.error(t('export.outside')))
        continue
      }
      let entries: ReturnType<typeof parseTranscript> = []
      if (transcript.file) {
        try {
          entries = parseTranscript(await fs.readFile(transcript.file, 'utf-8'))
        } catch {
          entries = []
        }
      }
      const md = formatExport(entries, {
        chatId: currentChatId,
        workdir: currentWorkdir,
      })
      await fs.writeFile(target, md, 'utf-8')
      console.log(theme.assistant(t('export.done', { v: target })))
      continue
    }

    if (lower === '/doctor') {
      const { runGit } = await import('./gitTools.js')
      let gitOk = false
      let gitBranch: string | null = null
      try {
        const probe = await runGit(
          'git rev-parse --is-inside-work-tree',
          currentWorkdir,
          5000,
        )
        gitOk = probe.trim() === 'true'
        if (gitOk) {
          gitBranch = (
            await runGit('git branch --show-current', currentWorkdir, 5000)
          ).trim()
        }
      } catch {
        // git is not available here; gitOk stays false.
      }
      let clipboardTool: string | null = null
      try {
        clipboardTool = hasClipboardTool() ? 'available' : null
      } catch {
        // not available; clipboardTool stays null
      }
      const mcpStatus = mcpPool
        ? mcpPool.status()
        : { servers: [], toolCount: 0 }
      console.log(
        theme.system(
          renderDoctor({
            nodeVersion: process.version,
            platform: process.platform,
            workdir: currentWorkdir,
            gitOk,
            gitBranch,
            configOk: true,
            browserChannel: config.browserChannel,
            clipboardTool,
            mcpServers: mcpStatus.servers.length,
            mcpTools: mcpStatus.toolCount,
            transcriptOk: !!transcript.file,
            authSaved: authMarkerExists(),
            contextLimit: config.ui.contextLimit,
            hasOrigin: gitOk
              ? (await runGit('git remote', currentWorkdir, 5000)).includes(
                  'origin',
                )
              : undefined,
            minSendIntervalMs: config.browser.minSendIntervalMs,
            sshRemote: !!(process.env.SSH_CONNECTION || process.env.SSH_TTY),
          }),
        ),
      )
      continue
    }

    if (lower === '/permissions' || lower === '/allowed-tools') {
      console.log(
        theme.system(
          renderPermissions({
            write: config.confirmation.write,
            edit: config.confirmation.edit,
            bash: config.confirmation.bash,
            alwaysConfirm: config.confirmation.alwaysConfirm,
          }),
        ),
      )
      continue
    }

    if (lower === '/add-dir' || lower.startsWith('/add-dir ')) {
      const arg = trimmed.slice('/add-dir'.length).trim()
      const res = resolveExtraDir(arg, currentWorkdir)
      if ('error' in res) {
        console.error(theme.warn(res.error))
        continue
      }
      const stat = await fs.stat(res.path).catch(() => null)
      if (!stat || !stat.isDirectory()) {
        console.error(theme.error(t('adddir.not_dir', { v: res.path })))
        continue
      }
      console.log(theme.system(t('adddir.note', { v: res.path })))
      continue
    }

    if (lower === '/compact') {
      // Compaction: ask DeepSeek (in the CURRENT chat) to compress the
      // history into a handover summary, then start a NEW chat, resend the
      // system prompt and post the summary as the carried-over context.
      // Shared with the AUTO-compact path via performCompact() so both
      // paths stay identical (same retries, same fallback, same resend).
      const res = await performCompact({
        browser,
        currentChatId,
        workdir: currentWorkdir,
        locale: currentLocale,
        task: task ?? undefined,
        transcript,
        ui: editor,
        buildSystemPrompt: mod.buildSystemPrompt,
        tools: mod.createTools(currentWorkdir, { undo }),
        answerTimeoutMs: config.browser.answerTimeoutMs,
        fallbackLimit: COMPACT_FALLBACK_LIMIT,
      })
      if (res.ok) {
        currentChatId = res.chatId
        saveLastChat(currentChatId, currentWorkdir)
        freshChatNext = false
        // The new chat already carries the system prompt and the context.
        sendSystemPromptNext = false
      }
      continue
    }

    if (lower === '/review' || lower.startsWith('/review ')) {
      const rest = trimmed.slice('/review'.length).trim()
      const staged = rest.indexOf('--staged') !== -1
      const focus = rest.replace(/--staged/g, '').trim()
      const reviewTask = buildReviewPrompt(focus, staged)
      const reviewTools = mod.createTools(currentWorkdir, { undo })
      if (editor) editor.busy = true
      try {
        await runTask(browser, reviewTools, reviewTask, currentWorkdir, {
          transcript,
          freshChat: false,
          sendSystemPrompt: false,
          ui: editor || null,
          onChatReady: (chatId) => {
            if (chatId) {
              currentChatId = chatId
              saveLastChat(chatId, currentWorkdir)
            }
          },
        })
      } finally {
        if (editor) editor.busy = false
      }
      continue
    }

    if (lower === '/undo') {
      const result = await undo.undoLast()
      if (result.ok && result.record) {
        console.log(
          theme.assistant(
            t('undo.reverted', { v: result.record.originalPath }),
          ) +
            theme.system(
              result.record.existed ? t('undo.restored') : t('undo.deleted'),
            ),
        )
        transcript.log('undo', { path: result.record.originalPath })
      } else {
        console.error(
          theme.error(t('undo.failed', { v: String(result.reason ?? '') })),
        )
      }
      continue
    }

    if (lower === '/undo-list' || lower === '/history') {
      const list = await undo.list(10)
      if (!list.length) {
        console.log(theme.system(t('undo.empty')))
      } else {
        for (const r of list) {
          const stamp = new Date(r.stamp).toLocaleString()
          const flag = r.existed ? t('undo.changed') : t('undo.created')
          console.log(theme.system(`${stamp}  [${flag}]  ${r.originalPath}`))
        }
      }
      continue
    }

    if (lower === '/debug-dom') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const file = path.join(config.transcript.dir, `dom-${stamp}.html`)
      try {
        const result = await browser.dumpDom(file)
        console.log(theme.assistant(t('dom.saved', { v: result.file })))
        console.log(theme.system(t('dom.selectors')))
        console.log(JSON.stringify(result.selectors, null, 2))
      } catch (e) {
        console.error(theme.error(t('dom.save_error')), (e as Error).message)
      }
      continue
    }

    if (lower === '/cd' || lower.startsWith('/cd ')) {
      const rawTarget = trimmed.slice(3).trim()
      try {
        const newDir = rawTarget
          ? path.resolve(currentWorkdir, rawTarget)
          : sandboxRoot
        const rel = path.relative(sandboxRoot, newDir)
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          console.error(theme.error(t('cd.outside', { v: sandboxRoot })))
          continue
        }
        const stat = await fs.stat(newDir).catch(() => null)
        if (!stat || !stat.isDirectory()) {
          console.error(theme.error(t('cd.not_dir', { v: newDir })))
          continue
        }
        if (newDir === currentWorkdir) {
          console.log(theme.system(t('cd.already')))
          continue
        }
        if (reviewMode) {
          console.log(theme.system(t('cd.left_review')))
          reviewMode = null
        }
        currentWorkdir = newDir
        freshChatNext = true
        sendSystemPromptNext = true
        await refreshDynamicCommands(currentWorkdir)
        if (editor) editor.setCommands(buildSlashCommands())
        console.log(theme.system(t('cd.changed', { v: newDir })))
      } catch (e) {
        console.error(theme.error(t('cd.failed', { v: (e as Error).message })))
      }
      continue
    }

    // Custom command or skill invoked as a slash command? Expand it into a
    // task. Skills are instructions the agent follows; custom commands are
    // prompt templates with $ARGUMENTS / {{args}} placeholders.
    let expandedTask: string | null = null
    if (lower.startsWith('/')) {
      const name = trimmed.slice(1).split(/\s+/)[0]
      const rest = trimmed.slice(1 + name.length).trim()
      expandedTask = await expandSlashTarget(currentWorkdir, name, rest)
    }

    if (lower.startsWith('/') && expandedTask === null) {
      console.error(theme.error(t('msg.unknown_cmd', { v: trimmed })))
      continue
    }

    // ---- Regular task (including in review mode) ----

    const taskText = expandedTask !== null ? expandedTask : trimmed

    // Dev mode: pick up fresh logic modules before the task.
    await autoReload()

    transcript.log('user_task', { task: taskText, workdir: currentWorkdir })

    const tools = mod.createTools(currentWorkdir, { undo })
    if (mcpPool) tools.push(...mcpPool.tools)
    if (editor) editor.busy = true
    try {
      await runTask(
        browser,
        tools,
        taskText,
        currentWorkdir,
        {
          transcript,
          freshChat: freshChatNext,
          sendSystemPrompt: sendSystemPromptNext,
          queue: pendingQueue,
          ui: editor || null,
          onChatReady: (chatId) => {
            // Save the session right at the start of the dialog, without waiting
            // for the task to finish. Otherwise a long/aborted task would not
            // get the chat into ~/.zames/.sessions and it would be lost after a restart.
            if (chatId) {
              currentChatId = chatId
              saveLastChat(chatId, currentWorkdir)
            }
          },
          // Auto-compact between tool calls when the context nears the
          // window limit. Enabled via browser.autoCompact. It sends messages
          // from THIS execution context (the task owns the browser), and the
          // loop awaits it, so it serializes with the throttle.
          onAutoCompact: config.browser.autoCompact
            ? async () => {
                const res = await performCompact({
                  browser,
                  currentChatId,
                  workdir: currentWorkdir,
                  locale: currentLocale,
                  task: taskText,
                  transcript,
                  ui: editor,
                  buildSystemPrompt: mod.buildSystemPrompt,
                  tools: mod.createTools(currentWorkdir, { undo }),
                  answerTimeoutMs: config.browser.answerTimeoutMs,
                  quiet: true,
                  skipUiLock: true,
                })
                if (res.ok) {
                  currentChatId = res.chatId
                  saveLastChat(res.chatId, currentWorkdir)
                }
                return res.ok ? res.chatId : null
              }
            : null,
          autoCompactPct: config.browser.autoCompactPct,
          contextLimit: config.ui.contextLimit,
          getTokenUsage: () => browser.getLastTokenUsage(),
          goal: sessionGoal,
        },
        inputAttachments,
      )
    } finally {
      if (editor) editor.busy = false
    }

    freshChatNext = false
    sendSystemPromptNext = false
    if (!currentChatId) {
      currentChatId = await browser.getCurrentChatId()
    }
    saveLastChat(currentChatId, currentWorkdir)
  }

  if (editor) editor.dispose()
  if (scheduleTimer) clearInterval(scheduleTimer)
  await browser.close().catch(() => {})
  await mod.closeWeb().catch(() => {})
  if (mcpPool) await mcpPool.close().catch(() => {})
  transcript.close()
  // One dim line so the operator can find the log and the session after
  // the run (previously the path was only available via /transcript).
  console.log(
    theme.dim(
      t('msg.exit_summary', {
        transcript: transcript.file || t('common.off'),
        chat: currentChatId || t('chats.not_created'),
      }),
    ),
  )
}

main().catch((e) => {
  console.error(theme.error(t('msg.critical')), (e as Error).message)
  if (debug) console.error((e as Error).stack)
  process.exit(1)
})
