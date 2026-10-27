#!/usr/bin/env node
import './color.js'
import path from 'path'
import fs from 'fs/promises'
import { readFileSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import {
  theme,
  applyTheme,
  themeColors,
  themeNames,
  currentThemeName,
  isThemeName,
} from './theme.js'
import { setInputBorder } from './tui/ui-colors.js'

import { DeepSeekBrowser, headlessUACacheReady } from './browser.js'
import { QwenBrowser } from './qwen-browser.js'
import { GlmBrowser } from './glm-browser.js'
import { authMarkerHas } from './browser-pure.js'
import { canShowWindow } from './browser-login.js'
import {
  isProviderId,
  asProviderId,
  providerChatUrlPrefix,
  providerLabel,
  providerHasModelPicker,
  providerNeedsVisibleBrowser,
  providerConfigSection,
  PROVIDER_IDS,
  type ProviderId,
} from './providers.js'
import {
  createTools,
  mergeTools,
  filterToolsForReadOnly,
  filterToolsByAllowList,
} from './tools.js'
import {
  createTodoStore,
  getTodos,
  setTodos,
  resetTodos,
  renderTodos,
  type TodoItem,
} from './extraTools.js'
import { runAgentLoop } from './agent-loop.js'
import { createSubagentRunner } from './subagent.js'
import { createSpinner } from './spinner.js'
import { LineEditor } from './input.js'
import { TuiEditor } from './tui/TuiEditor.js'
import type { UiEditor } from './tui/types.js'
import { promptOnce } from './prompt.js'
import {
  parseImagePaste,
  extForMime,
  saveToTemp,
  guessMime,
  formatSize,
  readClipboardImageDetailed,
  sniffMime,
  readWindowsClipboardFiles,
  hasClipboardTool,
  writeClipboardText,
  contentHash,
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
  providerAskDeadlineMs,
  shadowedConfigKeys,
  type ConfigField,
} from './config.js'
import { runConfigMenu } from './config-menu.js'
import { runConfigMenuInk } from './tui/run-config-menu.js'
import { formatConfigList } from './config-commands.js'
import { handleConfigCommand as runConfigCommand } from './config-command.js'
import {
  translate,
  normalizeLocale,
  localeDisplayName,
  isLocale,
  type Locale,
} from './i18n.js'
import { Transcript } from './transcript.js'
import { UndoStore, undoDateLabel } from './undo.js'
import {
  CheckpointStore,
  pickRecord as pickCheckpoint,
  isFullStampSelector,
} from './checkpoint.js'
import { selfReview, selfDiff, selfApply, selfList } from './self-review.js'
import { type RestoredMessage } from './commands.js'
import { performCompact } from './compact.js'
import { clampGoalCondition } from './goal.js'
import { applyBrowserLiveConfig, applyStoreLiveConfig } from './config-live.js'
import {
  buildHandoffText,
  saveProviderHandoff,
  readProviderHandoff,
  handoffFromLabel,
  clearProviderHandoff,
} from './provider-handoff.js'
import {
  Scheduler,
  parseInterval,
  formatInterval,
  formatJobLine,
  parseCron,
} from './scheduler.js'
import { createCliArgs } from './cli-args.js'
import { qwenContextWindow } from './qwen-ui.js'
import { glmContextWindow } from './glm-ui.js'
import { renderMarkdown, setAnswerWidth } from './markdown.js'
import { contentWidth } from './width.js'
import { renderStartupBanner } from './banner.js'
import { runStatusLineCommand } from './statusline.js'
import { parseBacklogNote } from './backlog.js'
import {
  askOperatorConfirm,
  type PendingMessage,
  type RunTaskDeps,
} from './run-task.js'
import { closeWeb } from './web.js'
import {
  assertCommandInsideRoot,
  runShell,
  killAllBackground,
} from './shell.js'
import {
  saveSession,
  loadLastSession,
  readSession,
  listSessions,
  sessionsDir,
  loadHistory,
  saveHistory,
  isInternalChat,
} from './sessions.js'
import { parseModelIntent, emptyModelListMessage } from './model-command.js'
import {
  parseResumeId,
  filterSessions,
  resumeProviderRefusal,
} from './resume-command.js'
import { formatLimits, limitsEmptyMessage } from './limits-command.js'
import { renderContextReport } from './context-command.js'
import { renderQueueView } from './queue-command.js'
import {
  parseProviderIntent,
  providerUsageMessage,
} from './provider-command.js'
import { formatStatus } from './status-command.js'
import type { ChatInfo, ChatProvider } from './types.js'
import type { McpPool } from './mcp.js'

interface ReviewMode {
  snapDir: string
  snapName: string
  originalWorkdir: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NL = String.fromCharCode(10)

// The last final assistant message, for the /copy command. Module-level
// because runTask() (which sees the answers) and the main loop (which handles
// /copy) are separate functions.
let lastAssistantMessage = ''

// Floor for a /loop interval. A loop faster than the send throttle (15s)
// cannot do anything useful and would just hammer the rate limit, so we refuse
// it. It does NOT touch the throttle itself.
const MIN_LOOP_MS = 15_000

// True when a session/credentials for `provider` were stored earlier
// (auth.json). Used by /doctor and the startup banner to report that auto
// re-login is ready. The marker is PER PROVIDER (see authMarkerHas).
function authMarkerExists(provider: ProviderId = config.provider): boolean {
  try {
    const raw = readFileSync(path.join(ZAMES_HOME, 'auth.json'), 'utf-8')
    return authMarkerHas(raw, provider)
  } catch {
    return false
  }
}

// The pure helpers live in src/cli-args.ts and are bound to this process's
// argv ONCE here. Call sites keep using getArg/hasFlag/getPositional.
const { getArg, hasFlag, getPositional } = createCliArgs(process.argv.slice(2))

// /compact asks the OLD chat for a summary. If browser.ask() exhausts its own
// rate-limit budget, aborting the whole compaction used to force the operator
// to start over. We retry the summary call a few times instead (inside
// performCompact()).
// How many restored messages the LOCAL fallback summary keeps when the model
// could not produce one (a rate limit / server error must not lose the
// compaction).
const COMPACT_FALLBACK_LIMIT = 40

const config = loadConfig()

/**
 * Keep the legacy `qwen.enabled` mirror in sync with the ACTIVE provider. The
 * field is written in one place (it used to be set from three call sites) and
 * is no longer READ by the code — it survives only so an old config keeps its
 * meaning. PURE state change on the live config object.
 */
function setProviderEnabledFlag(provider: ProviderId): void {
  config.qwen.enabled = provider === 'qwen'
}

// A `--provider <id>` CLI flag selects the backend for THIS run,
// mirroring the /provider command (which changes it live). Without this an
// operator who typed `--provider qwen` got the DEFAULT backend — the flag was
// silently treated as free-form task text and DeepSeek opened instead of Qwen.
const providerArg = getArg('--provider', null)
if (providerArg !== null) {
  if (isProviderId(providerArg)) {
    config.provider = providerArg
    setProviderEnabledFlag(providerArg)
  } else {
    console.error(
      theme.warn(
        'Unknown --provider "' +
          providerArg +
          '" (expected: ' +
          PROVIDER_IDS.join(' | ') +
          '). Using ' +
          config.provider +
          '.',
      ),
    )
  }
}

// Apply the configured answer width to the markdown renderer (0 = auto).
setAnswerWidth(config.ui?.answerWidth ?? 0)

// The color palette must be selected BEFORE the first line is rendered (the
// banner, startup notices): theme.ts starts on the default and every call site
// reads the live object, so one apply here repaints the whole session.
applyTheme(config.ui?.theme)
// Same for the input-box FRAME style: the TUI reads it per render, so one
// apply before the editor is created covers the first paint (a /config change
// goes through setConfigRuntime below).
setInputBorder(config.ui?.inputBorder)

// Current interface/agent language. Changed by the /config lang <ru|en> command.
let currentLocale: Locale = isLocale(config.ui?.locale)
  ? config.ui.locale
  : 'ru'
// Translation: reads currentLocale at call time, so a language change takes
// effect immediately, without a restart (for lines printed afterwards).
const t = (key: string, params?: Record<string, string | number>): string =>
  translate(currentLocale)(key, params)

// A project `.zamesrc.json` wins over the HOME config, so a key it ALSO sets
// silently defeats `/config set` — the value looks saved and comes back stale
// after a restart (the reported "language resets to English" case). Say it at
// startup, before a task, instead of letting the operator hunt for it.
const shadowedAtStartup = shadowedConfigKeys()
if (shadowedAtStartup.length) {
  console.error(
    theme.warn(
      t('cfg.shadowed', {
        file: CONFIG_PATHS.PROJECT_CONFIG,
        keys: shadowedAtStartup.join(', '),
      }),
    ),
  )
}

// Headless is the default. --headed forces a visible window (useful for the
// first sign-in or debugging the DOM). --headless keeps it explicit.
// DeepSeek/Qwen run headless by default; GLM CANNOT: z.ai answers a headless
// send with an Aliyun captcha (see PROVIDERS[id].needsVisibleBrowser). An
// explicit --headless still wins, and --headed forces a window everywhere.
function headlessFor(provider: ProviderId): boolean {
  if (hasFlag('--headed')) return false
  if (hasFlag('--headless')) return true
  return config.headless && !providerNeedsVisibleBrowser(provider)
}
const headless = headlessFor(config.provider)
const debug = hasFlag('--debug') || config.debug
const maxIterArg = getArg('--max-iter', null)
// A non-numeric `--max-iter abc` yields NaN, which the loop treats as
// "unlimited" (NaN > 0 is false). Fall back to the configured value instead
// of silently disabling the cap.
// The CLI value OVERRIDES the config for the whole run; when no flag is
// given, the value is read from config LIVE so `/config set maxIterations`
// takes effect on the next task.
const maxIterParsed = maxIterArg !== null ? Number(maxIterArg) : NaN
const maxIterOverride = Number.isFinite(maxIterParsed) ? maxIterParsed : null
function currentMaxIter(): number {
  return maxIterOverride !== null ? maxIterOverride : config.maxIterations
}

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
// Plan mode (read-only): start with it ON via --plan, toggle with /plan. When
// on, mutating tools are filtered out of the tool set entirely (see
// filterToolsForReadOnly). Declared here because tool creation happens before
// the main loop.
let planMode = hasFlag('--plan')

// Machine-readable output for scripts/CI. 'text' (default) is the normal
// human UI; 'json'/'jsonl' stream the transcript events as JSON lines on
// stdout, while all human text is pushed to stderr so the stream stays clean.
// Meant for one-shot mode (--task).
const outputFormat = (getArg('--output-format', 'text') || 'text').toLowerCase()
const jsonMode = outputFormat === 'json' || outputFormat === 'jsonl'
if (jsonMode) {
  // Keep stdout for the event stream only.
  console.log = ((...a: unknown[]) => {
    console.error(...a)
  }) as typeof console.log
}

// We store sessions (DeepSeek chats) in ~/.zames/.sessions so they survive
// a restart and are available for explicit restore (--resume-last,
// --chat <id>, /resume-id <id>). They are NOT brought up automatically on launch.
// Previously there was a single last-chat.json file that got lost when the
// project changed and gave no list of sessions to restore.
function saveLastChat(id: string | null, workdir = '', title = ''): void {
  if (!id) return
  // Tag the session with the ACTIVE provider: a chat id is only meaningful to
  // the backend that created it, so a later resume must open it in the same
  // one (or refuse). Without this a /provider switch made a resume try to open a
  // qwen id in DeepSeek (and vice versa).
  saveSession({ id, workdir, title, provider: config.provider })
}

function loadLastChat(workdir = ''): string | null {
  const s = loadLastSession(workdir, config.provider)
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
  'checkpoint',
  'transcript',
  'spinner',
  'config',
  'fsutil',
  'backlog',
  // Modules index.ts now calls through the mod bag: without this a
  // /reload silently kept the OLD commands/run-task/attach-refs until a restart.
  // 'input/layout' is NOT listed: its only live consumers are input.ts (the
  // long-lived LineEditor, itself not reloadable) and spinner.ts, which already
  // picks up a fresh copy transitively.
  'commands',
  'run-task',
  'attach-refs',
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
  collapseBacklog: typeof import('./backlog.js').collapseBacklog
  appendBacklogItem: typeof import('./backlog.js').appendBacklogItem
  backlogStats: typeof import('./backlog.js').backlogStats
  backlogNeedsPruning: typeof import('./backlog.js').backlogNeedsPruning
  commands: typeof import('./commands.js')
  attach: typeof import('./attach-refs.js')
  runTask: typeof import('./run-task.js').runTask
}

const mod: ModBag = {
  commands: null as unknown as ModBag['commands'],
  attach: null as unknown as ModBag['attach'],
  runTask: null as unknown as ModBag['runTask'],
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
  collapseBacklog: null as unknown as ModBag['collapseBacklog'],
  appendBacklogItem: null as unknown as ModBag['appendBacklogItem'],
  backlogStats: null as unknown as ModBag['backlogStats'],
  backlogNeedsPruning: null as unknown as ModBag['backlogNeedsPruning'],
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
  if (pick('backlog', 'collapseBacklog'))
    mod.collapseBacklog = pick(
      'backlog',
      'collapseBacklog',
    ) as ModBag['collapseBacklog']
  if (pick('backlog', 'appendBacklogItem'))
    mod.appendBacklogItem = pick(
      'backlog',
      'appendBacklogItem',
    ) as ModBag['appendBacklogItem']
  if (pick('backlog', 'backlogStats'))
    mod.backlogStats = pick('backlog', 'backlogStats') as ModBag['backlogStats']
  if (pick('backlog', 'backlogNeedsPruning'))
    mod.backlogNeedsPruning = pick(
      'backlog',
      'backlogNeedsPruning',
    ) as ModBag['backlogNeedsPruning']

  if (pick('commands', 'missingCommandArgs'))
    mod.commands = loaded.get('commands') as ModBag['commands']
  if (pick('attach-refs', 'resolveAttachPath'))
    mod.attach = loaded.get('attach-refs') as ModBag['attach']
  if (pick('run-task', 'runTask'))
    mod.runTask = pick('run-task', 'runTask') as ModBag['runTask']

  return { count: loaded.size, errors }
}

// Initial load so that mod.buildSystemPrompt and the rest are populated.
await reloadModules()

// Dev mode: auto-reload of the logic modules before each task.
// Enabled by the --dev flag (`npm run dev` sets it) or config.hotReload === true.
// In normal mode (npm start, global zames) auto-reload is off.
const devMode = hasFlag('--dev') || config.hotReload === true

// The saved credentials of the ACTIVE provider: DeepSeek keeps the legacy
// `browser.auth` (so an old config works), every other backend owns its own
// section, so a DeepSeek login is never typed into a Qwen/GLM form.
function activeAuth(): { username: string; password: string } {
  const section = providerConfigSection(config.provider)
  if (!section) {
    return {
      username: config.browser.auth.username,
      password: config.browser.auth.password,
    }
  }
  const sec = (
    config as unknown as Record<
      string,
      { auth?: { username?: string; password?: string } }
    >
  )[section]
  return {
    username: (sec && sec.auth && sec.auth.username) || '',
    password: (sec && sec.auth && sec.auth.password) || '',
  }
}

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

function printHelp(): void {
  // Self-development commands (backlog / self-review) are shown ONLY in dev
  // mode. A regular package install must not advertise them to the user — and
  // the main loop rejects them too (see the guard at the dispatch).
  const devHelp = devMode
    ? '  ' +
      t('help.cmd.improve') +
      '\n  ' +
      t('help.cmd.backlog') +
      '\n  ' +
      t('help.cmd.debug_dom') +
      '\n  ' +
      t('help.cmd.help') +
      '\n  ' +
      t('help.cmd.exit') +
      '\n\n' +
      theme.bold(t('help.self_review')) +
      '\n  ' +
      t('help.self.review') +
      '\n  ' +
      t('help.self.fix') +
      '\n  ' +
      t('help.self.done') +
      '\n  ' +
      t('help.self.list') +
      '\n  ' +
      t('help.self.diff') +
      '\n  ' +
      t('help.self.apply') +
      '\n\n'
    : '  ' +
      t('help.cmd.debug_dom') +
      '\n  ' +
      t('help.cmd.help') +
      '\n  ' +
      t('help.cmd.exit') +
      '\n'
  console.log(`
${theme.bold('zames')} — ${t('app.tagline', {
    provider: browserProviderUrl()
      .replace(/^https?:\/\//, '')
      .split('/')[0],
  })}

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
  --provider <id>    ${t('help.opt.provider')}
  --plan             ${t('help.opt.plan')}
  --output-format <f> ${t('help.opt.output_format')}
  --debug            ${t('help.opt.debug')}
  --dev              ${t('help.opt.dev')}
  --no-color         ${t('help.opt.no_color')}
  --version, -v      ${t('help.opt.version')}
  --help, -h         ${t('help.opt.help')}

${t('help.color_note')}

${theme.bold(t('help.while_working'))}
  ${t('help.key.queue')}
  ${t('help.key.history')}
  ${t('help.key.search')}
  ${t('help.key.words')}
  ${t('help.key.undo')}
  ${t('help.key.clear_screen')}
  ${t('help.key.slash')}
  ${t('help.key.newline')}
  ${t('help.key.attach')}
  ${t('help.key.esc')}
  ${t('help.key.bang')}
  ${t('help.key.scroll')}
  ${t('help.key.wheel')}

${theme.bold(t('help.commands'))}

${theme.bold(t('help.sec.session'))}
  ${t('help.cmd.new')}
  ${t('help.cmd.sessions')}
  ${t('help.cmd.chats')}
  ${t('help.cmd.resume_id')}
  ${t('help.cmd.last')}
  ${t('help.cmd.retry')}
  ${t('help.cmd.rename')}

${theme.bold(t('help.sec.workspace'))}
  ${t('help.cmd.chat')}
  ${t('help.cmd.cd')}
  ${t('help.cmd.pwd')}
  ${t('help.cmd.status')}
  ${t('help.cmd.reload')}

${theme.bold(t('help.sec.git'))}
  ${t('help.cmd.diff')}
  ${t('help.cmd.diffstat')}

${theme.bold(t('help.sec.agent'))}
  ${t('help.cmd.goal')}
  ${t('help.cmd.loop')}
  ${t('help.cmd.cron')}
  ${t('help.cmd.jobs')}
  ${t('help.cmd.thinking')}
  ${t('help.cmd.web')}
  ${t('help.cmd.plan')}
  ${t('help.cmd.compact')}
  ${t('help.cmd.queue')}
  ${t('help.cmd.tasks')}

${theme.bold(t('help.sec.context'))}
  ${t('help.cmd.context')}
  ${t('help.cmd.skills')}
  ${t('help.cmd.memory')}
  ${t('help.cmd.remember')}
  ${t('help.cmd.init')}
  ${t('help.cmd.mcp')}
  ${t('help.cmd.config')}
  ${t('help.cmd.theme')}
  ${t('help.cmd.lang')}

${theme.bold(t('help.sec.provider'))}
  ${t('help.cmd.provider')}${
    providerHasModelPicker(config.provider) ? '\n  ' + t('help.cmd.model') : ''
  }

${theme.bold(t('help.sec.files'))}
  ${t('help.cmd.transcript')}
  ${t('help.cmd.undo')}
  ${t('help.cmd.undo_list')}
  ${t('help.cmd.rewind')}
  ${t('help.cmd.rewind_list')}
  ${t('help.cmd.export')}
  ${t('help.cmd.cost')}
  ${t('help.cmd.limits')}
  ${t('help.cmd.copy')}
  ${t('help.cmd.doctor')}
  ${t('help.cmd.add_dir')}
  ${t('help.cmd.review')}
${devHelp}${dynamicCommands.length ? '\n' + theme.bold(t('help.skills')) + '\n' + dynamicCommands.map((d) => '  ' + (d.hint ? d.name + ' ' + d.hint : d.name).padEnd(24) + ' ' + d.description).join('\n') : ''}

${theme.bold(t('help.files'))}
  ${t('help.files.logs')}        ${config.transcript.dir}
  ${t('help.files.undo')}        ~/.zames/undo
  ${t('help.files.checkpoints')}   ~/.zames/checkpoints
  ${t('help.files.sessions')}      ${sessionsDir()}
  ${t('help.files.profile')}     ~/.zames/profile
  ${t('help.files.snapshots')}    ~/.zames/snapshots
  ${t('help.files.tmp')}   <project>/tmp ${t('help.files.tmp_note')}
  ${t('help.files.config')}      ${CONFIG_PATHS.HOME_CONFIG}
               ${CONFIG_PATHS.PROJECT_CONFIG}

${theme.dim(t('help.toggles_legend'))}
`)
}

function dirLabel(p: string): string {
  return path.basename(p) || p
}

// Dynamically discovered skills and custom commands for the current workdir.
// Filled in by refreshDynamicCommands() and shown in the «/» hint list and
// help. Skills are surfaced as /skill-name entries (user-invokable only).
let dynamicCommands: Array<{
  name: string
  description: string
  hint?: string
}> = []

async function refreshDynamicCommands(workdir: string): Promise<void> {
  const out: Array<{ name: string; description: string; hint?: string }> = []
  try {
    const { loadSkills, loadCommands } = await import('./context.js')
    const skills = await loadSkills(workdir)
    for (const s of skills) {
      if (!s.userInvokable) continue
      // A well-known skill (built-in or bundled methodology) has a localized
      // description keyed by NAME — its SKILL.md frontmatter is agent-facing
      // English, which must not leak into a Russian UI. `t` returns the key
      // itself when it is missing, so an unknown (user-authored) skill falls
      // back to its own description.
      const descKey = 'skill.desc.' + s.name
      const localized = t(descKey)
      out.push({
        name: '/' + s.name,
        description:
          localized !== descKey
            ? localized
            : s.description || t('help.cmd.skill'),
      })
    }
    const cmds = await loadCommands(workdir)
    for (const c of cmds) {
      // Carry the declared argument hint as a separate field so the hint is
      // SHOWN in the suggest list but never inserted into the input line.
      out.push({
        name: '/' + c.name,
        description: c.description || t('help.cmd.custom'),
        hint: c.argumentHint,
      })
    }
  } catch {
    // best-effort: a broken skill/command must not break the CLI
  }
  dynamicCommands = out
}

// Expand a slash target (skill or custom command) into a task string.
// Returns null when the name is neither a skill nor a custom command. When a
// custom command declares mandatory `arguments:` and some are missing, returns
// `{ missing }` so the caller can print the usage hint instead of sending an
// incomplete prompt.
async function expandSlashTarget(
  workdir: string,
  name: string,
  rest: string,
): Promise<
  { text: string; allowedTools?: string[] } | { missing: string[] } | null
> {
  try {
    const { loadSkills, loadCommands, skillBody } = await import('./context.js')
    const commands = await loadCommands(workdir)
    const cmd = commands.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    )
    if (cmd) {
      // Refuse to run when declared positional arguments are missing.
      const missing = mod.commands.missingCommandArgs(cmd.arguments, rest)
      if (missing.length) return { missing }
      const body = mod.commands.expandCommandArgs(cmd.body, rest, cmd.arguments)
      return { text: body || rest }
    }
    const skills = await loadSkills(workdir)
    const skill = skills.find(
      (s) => s.name.toLowerCase() === name.toLowerCase() && s.userInvokable,
    )
    if (skill) {
      let body = ''
      if (skill.builtinBody !== undefined) {
        body = skill.builtinBody
      } else {
        try {
          const raw = await fs.readFile(skill.path, 'utf-8')
          body = skillBody(raw)
        } catch {
          body = ''
        }
      }
      const from = skill.path ? ' (from ' + skill.path + ')' : ' (built-in)'
      const header = 'Follow the skill "' + skill.name + '"' + from + '.'
      const extra = rest
        ? '\n\nAdditional instructions from the operator: ' + rest
        : ''
      // A skill may declare allowed-tools (Claude Code frontmatter): the
      // operator expects the skill to run with ONLY those tools. Carry the
      // list to the task so the main loop can narrow the tool set.
      return {
        text: header + '\n\n' + body + extra,
        allowedTools:
          skill.allowedTools && skill.allowedTools.length
            ? skill.allowedTools
            : undefined,
      }
    }
  } catch {
    // fall through: treated as an unknown command
  }
  return null
}

// Slash-command descriptions in the current language (for LineEditor hints).
// Dev-only commands are filtered out unless the operator is in dev mode, so a
// regular install never advertises (or accepts) them. The pure assembly lives
// in commands.ts (buildSlashCommandHints); here we only supply the runtime
// data (dev flag, translator, dynamic skills/commands).
function buildSlashCommands(): Array<{ name: string; description: string }> {
  return mod.commands.buildSlashCommandHints({
    devMode,
    t,
    dynamic: dynamicCommands,
    provider: config.provider,
  })
}

// We put the agent's temporary files (one-off scripts, etc.) in
// <project>/tmp — this folder is in .gitignore and is cleaned on every launch.
const TMP_DIR = path.join(__dirname, '..', 'tmp')

async function cleanTmpDir(): Promise<void> {
  try {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
    await fs.mkdir(TMP_DIR, { recursive: true })
  } catch (e) {
    if (debug) console.error('tmp: cleanup failed:', (e as Error).message)
  }
}

// The agent works in the directory it was launched from (process.cwd()).
// This is the sandbox root: tools cannot go above it.
async function resolveWorkdir(): Promise<string> {
  const explicitDir = getArg('--dir', null)
  const dir = explicitDir ? path.resolve(explicitDir) : process.cwd()
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(t('cd.not_dir', { v: dir }))
  }
  return dir
}

/**
 * The answer timeout for a one-off provider call (compact summary, etc.).
 * Qwen's cold guest turns are far slower than DeepSeek's, so using
 * config.browser.answerTimeoutMs there cut them off; pick the active
 * provider's own value.
 */
/** True when the ACTIVE provider derives its pause adaptively (see part C). */
function providerAdaptiveThrottle(provider: ProviderId): boolean {
  const section = providerConfigSection(provider)
  if (!section) return false
  const sec = (config as unknown as Record<string, Record<string, unknown>>)[
    section
  ]
  return !!sec && sec.adaptiveThrottle === true
}

/** The configured model id of a provider ('n/a' when it has no model picker). */
function providerModelOf(provider: ProviderId): string {
  const section = providerConfigSection(provider)
  if (!section) return 'n/a'
  const sec = (config as unknown as Record<string, Record<string, unknown>>)[
    section
  ]
  const m = sec ? sec.model : ''
  return typeof m === 'string' ? m : ''
}

function providerAnswerTimeoutMs(): number {
  return providerSectionNumber(
    'answerTimeoutMs',
    config.browser.answerTimeoutMs,
  )
}

/**
 * Read a number from the ACTIVE provider's own config section (`qwen.*`,
 * `glm.*`), or the shared fallback for DeepSeek (whose section is `browser`).
 * This replaced `provider === 'qwen' ? config.qwen.x : shared`, which silently
 * gave every NEW provider the DeepSeek timing.
 */
function providerSectionNumber(
  field: 'answerTimeoutMs' | 'contextLimit' | 'minSendIntervalMs',
  fallback: number,
): number {
  const section = providerConfigSection(config.provider)
  if (!section) return fallback
  const s = (config as unknown as Record<string, Record<string, number>>)[
    section
  ]
  const v = s ? s[field] : undefined
  return typeof v === 'number' ? v : fallback
}

/** The per-provider config section object, or null for DeepSeek. */
function activeProviderSection(): Record<string, unknown> | null {
  const section = providerConfigSection(config.provider)
  if (!section) return null
  return (
    (config as unknown as Record<string, Record<string, unknown>>)[section] ||
    null
  )
}

/** The provider's base chat URL, used by /chat to build the right link. */
function browserProviderUrl(): string {
  return providerChatUrlPrefix(config.provider)
}

/**
 * The context window (tokens) for the ACTIVE provider. The backends advertise
 * different windows and a provider's window may be PER-MODEL (Qwen), so a
 * single global number would either overstate a small model or understate a
 * 1M build — and the number is the denominator of the auto-compact threshold,
 * so an error directly delays (or prematurely fires) compaction.
 *
 * The provider's own `contextLimit` wins; DeepSeek (which has no section)
 * falls back to `ui.contextLimit`.
 */
function effectiveContextLimit(): number {
  const own = providerSectionNumber('contextLimit', 0)
  if (own > 0) return own
  return config.ui.contextLimit
}

/**
 * Re-derive the ACTIVE provider's `contextLimit` from a picked model id and
 * persist it. Called by `/model` on an explicit pick (never on startup), so a
 * manual `/config set <provider>.contextLimit` survives until the operator
 * switches model again. An UNKNOWN model id leaves the limit alone: guessing
 * would either fire auto-compact too early or too late. The live editor is
 * repainted by the caller (it owns the `editor` reference); this only touches
 * config.
 */
function applyModelContextLimit(model: string): void {
  const section = providerConfigSection(config.provider)
  if (!section) return
  const window =
    config.provider === 'qwen'
      ? qwenContextWindow(model)
      : glmContextWindow(model)
  if (window === null) return
  const sec = activeProviderSection()
  if (!sec) return
  sec.contextLimit = window
  try {
    writeConfigValue('home', `${section}.contextLimit`, String(window))
  } catch {}
}

/**
 * Build the browser for a provider. Called at startup AND on a live
 * `/provider` switch, so both paths construct the class the same way. The
 * backends differ in every layer (selectors, SSE format, chat-id scheme), so
 * the choice is a class, not a flag; the shared timings live in
 * config.browser and only the provider's own section is overridden.
 */
function createProviderBrowser(
  provider: ProviderId,
  onContextLimit: (() => Promise<boolean>) | null = null,
): ChatProvider {
  // Saved credentials go into the ACTIVE provider's section: browser.auth
  // belongs to DeepSeek (so old configs keep working), qwen.auth / glm.auth
  // are their own. Sharing one pair meant a DeepSeek login was typed into the
  // Qwen form.
  const persistAuth = (username: string, password: string): void => {
    const section = providerConfigSection(provider)
    const prefix = section ? section + '.auth' : 'browser.auth'
    const target = section
      ? (
          config as unknown as Record<string, { auth?: Record<string, string> }>
        )[section]
      : null
    if (target) {
      if (!target.auth) target.auth = { username: '', password: '' }
      target.auth.username = username
      target.auth.password = password
    } else {
      config.browser.auth.username = username
      config.browser.auth.password = password
    }
    try {
      writeConfigValue('home', prefix + '.username', username)
      writeConfigValue('home', prefix + '.password', password)
    } catch {}
  }

  switch (provider) {
    case 'qwen':
      return new QwenBrowser({
        headless: headlessFor('qwen'),
        debug,
        channel: config.browserChannel,
        ...config.browser,
        // Qwen-specific overrides (see config.qwen): no 15s DeepSeek
        // throttle, a longer cold-start answer timeout.
        minSendIntervalMs: config.qwen.minSendIntervalMs,
        answerTimeoutMs: config.qwen.answerTimeoutMs,
        model: config.qwen.model,
        auth: config.qwen.auth,
        loginTimeoutMs: config.browser.loginTimeoutMs,
        locale: currentLocale,
        onAuthSave: persistAuth,
        onContextLimit,
      })
    case 'glm':
      return new GlmBrowser({
        headless: headlessFor('glm'),
        debug,
        channel: config.browserChannel,
        ...config.browser,
        minSendIntervalMs: config.glm.minSendIntervalMs,
        answerTimeoutMs: config.glm.answerTimeoutMs,
        model: config.glm.model,
        auth: config.glm.auth,
        // Dev runs (`npm run dev`, i.e. `--dev`) record the telemetry
        // automatically: it is a diagnostic for the developer. For a regular
        // user it stays OFF by default (see DEFAULTS in config.ts) and is
        // opted into with `/config set browser.sendTelemetry true`.
        sendTelemetry: config.browser.sendTelemetry || devMode,
        logsDir: config.transcript.dir,
        loginTimeoutMs: config.browser.loginTimeoutMs,
        locale: currentLocale,
        onAuthSave: persistAuth,
        onContextLimit,
      })
    case 'deepseek':
    default:
      return new DeepSeekBrowser({
        headless: headlessFor('deepseek'),
        debug,
        channel: config.browserChannel,
        ...config.browser,
        locale: currentLocale,
        onAuthSave: persistAuth,
        onContextLimit,
      })
  }
}

/**
 * Print the dialogue of the just-opened chat into the terminal. Called by
 * /resume, /resume-id and on startup when a previous session is restored, so
 * the operator sees the context instead of a bare "Chat opened.".
 *
 * Best-effort: a DOM-scraping failure must never break the restore.
 */
async function printRestoredHistory(
  browser: ChatProvider,
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
  const displayable = mod.commands.trimRestoredMessages(all, 0)
  const messages = mod.commands.trimRestoredMessages(all)
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
    // sees the same signal whether or not auto-compact is enabled. The limit
    // is the ACTIVE provider's window (Qwen's is per-model).
    const limit = effectiveContextLimit()
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
        t('chats.history_truncated', {
          n: String(mod.commands.RESTORED_HISTORY_LIMIT),
        }),
      ),
    )
  }
}

// Build the explicit dependency bag for runTask() (src/run-task.ts). The
// main loop owns the browser/queue/config state, so every call site passes
// the SAME collaborators here instead of runTask reaching into module
// globals.
function runTaskDeps(): RunTaskDeps {
  return {
    t,
    locale: currentLocale,
    debug,
    maxIter: currentMaxIter(),
    config,
    runAgentLoop: mod.runAgentLoop,
    createSpinner: mod.createSpinner,
    onAssistantMessage: (msg) => {
      lastAssistantMessage = msg
    },
  }
}

// ---------- main ----------

async function main(): Promise<void> {
  // Read the package version once: --version prints it and the interactive
  // banner shows it (a version in the first lines is what a bug report needs).
  const pkgVersion = await fs
    .readFile(path.join(__dirname, '..', 'package.json'), 'utf-8')
    .then((raw) => JSON.parse(raw).version as string)
    .catch(() => '')
  if (hasFlag('--version') || hasFlag('-v')) {
    console.log(pkgVersion || 'unknown')
    return
  }

  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp()
    return
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

  // A styled startup banner in an interactive terminal; a plain two-line
  // header when the output is piped (scripts/CI parse it).
  if (process.stdout.isTTY && !jsonMode && config.ui.tui) {
    console.log(
      renderStartupBanner(
        {
          title: 'zames',
          version: pkgVersion || '?',
          workdir: currentWorkdir,
          provider: providerLabel(config.provider),
          hint: t('msg.banner_hint'),
        },
        contentWidth(),
      ),
    )
  } else {
    console.log(theme.system(t('msg.working_dir', { v: currentWorkdir })))
    console.log(theme.system(t('msg.version', { v: pkgVersion || '?' })))
  }

  const transcript = new Transcript({
    dir: config.transcript.dir,
    enabled: config.transcript.enabled,
    sessionName: dirLabel(currentWorkdir),
    // In json/jsonl mode mirror every event to stdout as a JSON line, even
    // when the transcript FILE is disabled.
    onLine: jsonMode ? (line) => process.stdout.write(line) : null,
  })
  if (transcript.file) {
    console.log(theme.system(t('msg.transcript', { v: transcript.file })))
  }

  const undo = new UndoStore(config.undo)
  const checkpoints = new CheckpointStore(config.checkpoint)

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
    for (const w of st.warnings) console.error(theme.warn(t(w.key, w.params)))
  } catch (e) {
    console.error(theme.warn(t('mcp.load_failed', { v: (e as Error).message })))
  }

  // Build the browser for the ACTIVE provider. The two backends differ in
  // every layer (selectors, SSE format, chat-id scheme), so the switch is a
  // class choice, not a flag. The shared timings live in config.browser; only
  // the model is provider-specific. A provider switch takes effect on the
  // next launch (the operator is told to restart).
  // `let`, not `const`: a live /provider switch disposes this instance and
  // builds the other one IN PLACE (see the /provider block in the main loop),
  // so the URL changes without restarting zames.
  // The context-limit recovery is a closure over main() session state, but
  // the browser is built BEFORE that state exists and it needs the callback
  // at construction. This holder breaks the cycle: the factory reads it
  // lazily on every recovery, and it is filled right after the session
  // variables are set up (before the first task). Null = the provider fails
  // with a clear message instead of retrying into a dead chat.
  let contextLimitRecovery: (() => Promise<boolean>) | null = null
  const onContextLimit = (): Promise<boolean> =>
    contextLimitRecovery ? contextLimitRecovery() : Promise.resolve(false)

  let browser: ChatProvider = createProviderBrowser(
    asProviderId(config.provider),
    onContextLimit,
  )

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
    await transcript.close()
    process.exit(1)
  }

  // DeepSeek UI health probe. The agent drives a page we do not control, so a
  // redesign silently breaks selectors and the FIRST symptom is a task hanging
  // on "input field not found". Probe the always-present controls right after
  // login and warn the operator up front. Best-effort: a probe failure must
  // never block startup.
  const warnUiHealth = (h: {
    ok: boolean
    missing: string[]
    missingCritical: string[]
  }): void => {
    if (h.missingCritical.length) {
      console.error(
        theme.warn(
          t('ui.probe_failed', {
            v: h.missingCritical.join(', '),
            provider: providerLabel(config.provider),
          }),
        ),
      )
    } else if (h.missing.length) {
      console.error(
        theme.warn(
          t('ui.probe_degraded', {
            v: h.missing.join(', '),
            provider: providerLabel(config.provider),
          }),
        ),
      )
    }
  }
  try {
    warnUiHealth(await browser.probeUiHealth())
  } catch {}

  // One-shot mode
  if (task) {
    const baseTools = mod.createTools(currentWorkdir, {
      undo,
      readOnly: planMode,
    })
    const tools = mergeTools(baseTools, mcpPool?.tools, planMode)

    let freshChat = true
    let sendSystemPrompt = true

    // By default we start a new chat. To continue a previous session —
    // explicitly: --chat <id> or --resume-last.
    let resumeId = chatIdArg
    if (!resumeId && resumeLastFlag && !newChatFlag) {
      const last = loadLastSession(currentWorkdir, config.provider)
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

    const result = await mod.runTask(
      runTaskDeps(),
      browser,
      tools,
      task,
      currentWorkdir,
      {
        transcript,
        freshChat,
        sendSystemPrompt,
        selfImprovement: devMode,
        onChatReady: (chatId) => {
          if (chatId) saveLastChat(chatId, currentWorkdir)
        },
      },
    )
    // One-shot mode (--task) is documented for scripts/CI. A failed agent run
    // used to exit 0, so the CI job stayed green; surface it as exit code 1.
    if (!result.ok) process.exitCode = 1
    await browser.close()
    await mod.closeWeb().catch(() => {})
    if (mcpPool) await mcpPool.close().catch(() => {})
    await transcript.close()
    return
  }

  if (
    providerNeedsVisibleBrowser(config.provider) &&
    headlessFor(config.provider)
  ) {
    console.log(
      theme.warn(
        t('provider.needs_headed', { v: providerLabel(config.provider) }),
      ),
    )
  }
  console.log(theme.system(t('msg.interactive')))
  console.log(theme.system(t('msg.queue_hint')))
  console.log(theme.dim(t('msg.first_hint')))
  // No stored session yet (auth.json absent for THIS provider): the first
  // task will need a sign-in. The auto-login handles it, but a heads-up in
  // the banner saves the operator from wondering why the first task pauses.
  // The hint text describes the browser-based flow (see src/browser-login.ts);
  // the old wording promised a terminal prompt, which is no longer the main
  // path.
  if (!authMarkerExists()) {
    console.log(
      theme.warn(
        t('msg.first_login_hint', { provider: providerLabel(config.provider) }),
      ),
    )
  }
  // Nudge when BACKLOG.md has grown large: /improve reads the whole file, so a
  // bloated backlog costs tokens on every self-improvement run. Best-effort.
  if (devMode) {
    try {
      const bl = await fs.readFile(
        path.join(currentWorkdir, 'BACKLOG.md'),
        'utf-8',
      )
      const st = mod.backlogStats(bl)
      if (mod.backlogNeedsPruning(st)) {
        console.log(
          theme.warn(
            t('backlog.warn', {
              lines: String(st.lines),
              chars: String(st.chars),
            }),
          ),
        )
      }
    } catch {}
  }

  let freshChatNext = true
  let sendSystemPromptNext = true
  /**
   * Recover from "Length limit reached. Please start a new chat.": the chat
   * refuses EVERY further send, so the only way to keep working is compaction
   * into a fresh chat. Returns true when a new chat holds the system prompt
   * and the handover, i.e. the browser may resend the refused message there.
   *
   * `contextExhausted` skips the summary call inside performCompact: asking the
   * OLD chat to summarize itself is refused exactly like the send that failed,
   * so the summary is built from the history endpoint instead.
   */
  const recoverFromContextLimit = async (): Promise<boolean> => {
    const res = await performCompact({
      browser,
      providerLabel: providerLabel(config.provider),
      currentChatId,
      workdir: currentWorkdir,
      locale: currentLocale,
      transcript,
      ui: editor,
      buildSystemPrompt: mod.buildSystemPrompt,
      tools: mod.createTools(currentWorkdir, { undo, todos: todoStore }),
      answerTimeoutMs: providerAnswerTimeoutMs(),
      quiet: true,
      skipUiLock: true,
      selfImprovement: devMode,
      contextExhausted: true,
    })
    if (!res.ok) return false
    currentChatId = res.chatId
    if (currentChatId) saveLastChat(currentChatId, currentWorkdir)
    // The fresh chat already carries the system prompt and the handover, and
    // the session continues in it — later tasks must not open yet another chat.
    freshChatNext = false
    sendSystemPromptNext = false
    return true
  }
  contextLimitRecovery = recoverFromContextLimit
  // Resuming an existing chat already has the system-prompt at its start, so
  // resending it is wasteful and pollutes the context. Default: do NOT resend.
  // `--resend-prompt` or `browser.resendPromptOnResume` forces it (e.g. when
  // the prompt/tools changed).
  const promptOnResume = (): boolean =>
    resendPrompt || config.browser.resendPromptOnResume === true
  // Assigned by the /chats handler before it is read; no initial value needed
  // (the empty-array default was flagged as a useless assignment once the
  // /resume <n> handler that read it was removed).
  let lastChats: ChatInfo[]
  let currentChatId: string | null = null
  // The last task the operator sent (used by /retry). Plain text only.
  let lastTaskText = ''
  let running = true
  // The agent's TodoWrite checklist, shared with the tool factory and
  // persisted in the session JSON. A store (not module state) so /reload does
  // not silently drop the list, and so the writer in onTodosChange sees the
  // same instance the tools mutate.
  const todoStore = createTodoStore()
  const persistTodos = (): void => {
    if (!currentChatId) return
    saveSession({
      id: currentChatId,
      workdir: currentWorkdir,
      todos: getTodos(todoStore),
    })
  }
  // Write the checklist whenever the agent changes it, so a restart/resume
  // brings the tasks back (they used to be in-memory only).
  todoStore.onChange = () => persistTodos()

  // Subagents: the `Task` tool delegates a self-contained
  // sub-task to a nested agent loop in its OWN chat (context isolation — in
  // zames "context" IS the chat), then restores this chat and returns only
  // the report. Sequential by design (one browser, one send slot). On by
  // default via browser.subagents (its own budget caps the extra sends).
  const makeSubagentRunner = (): ReturnType<
    typeof createSubagentRunner
  > | null =>
    config.browser.subagents
      ? createSubagentRunner({
          browser,
          workdir: currentWorkdir,
          locale: currentLocale,
          runAgentLoop: mod.runAgentLoop,
          buildTools: (readOnly) => {
            const base = mod.createTools(currentWorkdir, {
              undo,
              todos: todoStore,
              readOnly: false,
              subagents: false,
            })
            return readOnly ? filterToolsForReadOnly(base) : base
          },
          transcript,
          maxSubagents: config.browser.maxSubagents,
          askDeadlineMs: providerAskDeadlineMs(config),
          maxAfterToolRetries: config.browser.maxAfterToolRetries,
          // An `ask` permission rule must also gate the subagent: otherwise a
          // guarded tool (e.g. a dangerous Bash command) would run inside the
          // subagent WITHOUT the operator's confirmation.
          onAskPermission: async (info) => {
            if (editor) editor.pause()
            try {
              return await askOperatorConfirm(
                null,
                t('perm.ask_sub', { tool: info.tool, reason: info.reason }),
                t,
                currentLocale,
              )
            } finally {
              if (editor) editor.resume()
            }
          },
        })
      : null

  // A compact "tasks: 2/5" summary for the status line. Empty when the list
  // is empty, so an idle status is not cluttered.
  const todosSummary = (): string => {
    const items = getTodos(todoStore)
    if (!items.length) return ''
    const done = items.filter((t) => t.status === 'completed').length
    return t('status.tasks_summary', {
      done: String(done),
      total: String(items.length),
    })
  }

  // Re-inject a persisted checklist after /resume-id or the startup restore.
  // The list is REPLACED (not merged): a resumed chat with no saved checklist
  // must clear the previous chat's tasks, otherwise the status line keeps
  // showing them for a chat that never had them.
  const loadSessionTodos = (id: string | null): void => {
    const s = readSession(id)
    const items = (s?.todos as TodoItem[] | undefined) || []
    setTodos(items, todoStore)
    if (!items.length) return
    const done = items.filter((x) => x.status === 'completed').length
    console.log(
      theme.system(
        t('tasks.restored', {
          done: String(done),
          total: String(items.length),
        }),
      ),
    )
  }

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
  // Ctrl+C on an idle agent EXITS the process. Without this latch a /loop job
  // whose task was interrupted (and every later fire) would be dropped into
  // the queue while nobody waits for it, and each tick printed "fired" into a
  // dying terminal. A loop is meant to outlive a single task, not the agent.
  let shuttingDown = false
  const stopScheduleTicker = (): void => {
    if (scheduleTimer) {
      clearInterval(scheduleTimer)
      scheduleTimer = null
    }
  }
  const startScheduleTicker = (): void => {
    if (scheduleTimer) return
    scheduleTimer = setInterval(() => {
      if (shuttingDown) return
      const due = scheduler.due(Date.now())
      for (const job of due) {
        // Do not pile MANY copies of the same job while the agent is busy: if
        // this job already has a pending message in the queue, skip this fire.
        // Otherwise a 1-minute loop would add a new task every minute while a
        // long task is in flight, and they would all run back-to-back.
        if (mod.commands.hasQueuedJob(pendingQueue, job.id)) {
          transcript.log('scheduled_skip_queued', {
            id: job.id,
            task: job.task,
          })
          continue
        }
        pendingQueue.push({ text: job.task, jobId: job.id })
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

  // null — normal mode.
  // { snapDir, snapName, originalWorkdir } — we're inside a snapshot, the chat
  // is already initialized with the review prompt, the user can just type "fix...".
  let reviewMode: ReviewMode | null = null

  process.on('SIGINT', async () => {
    running = false
    shuttingDown = true
    stopScheduleTicker()
    // Kill any background processes so no dev-server outlives the agent.
    killAllBackground()
    await browser.close().catch(() => {})
    // Close the lazy headless browser from web.js, otherwise it would stay
    // as a separate process after the agent exits.
    await mod.closeWeb().catch(() => {})
    if (mcpPool) await mcpPool.close().catch(() => {})
    await transcript.close()
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
    const last = loadLastSession(currentWorkdir, config.provider)
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
      loadSessionTodos(resumeId)
      await printRestoredHistory(browser, null, resumeId)
    } catch (e) {
      console.error(
        theme.error(t('msg.open_chat_error', { v: (e as Error).message })),
      )
    }
  }

  // In TTY we use LineEditor: it owns the input all the time, shows the
  // status above the input line and prints the agent's answers ABOVE it, so
  // the typed text is never overwritten by output. In non-TTY (pipe) —
  // the old promptOnce.
  let editor: UiEditor | null = null
  // Re-wire the browser login callbacks after the editor exists / a provider
  // swap. Assigned where the editor is built (see the login wiring below);
  // a no-op until then so /provider before setup is harmless.
  let wireLoginCallbacks: (b: unknown) => void = () => {}
  // statusLine hook timer (cleared on exit).
  let statusLineTimer: ReturnType<typeof setInterval> | null = null
  let waiter: ((v: PendingMessage | null) => void) | null = null
  const takeInput = (): Promise<PendingMessage | null> => {
    if (pendingQueue.length)
      return Promise.resolve(pendingQueue.shift() ?? null)
    return new Promise<PendingMessage | null>((resolve) => {
      waiter = resolve
    })
  }

  const buildPrompt = () => {
    if (reviewMode) {
      // Review mode is rare and MEANINGFUL, so it stays in the prompt.
      return (
        theme.prompt('❯ ') +
        theme.dim('(') +
        theme.warn(t('prompt.review')) +
        theme.dim(':') +
        theme.dir(reviewMode.snapName) +
        theme.dim(') ')
      )
    }
    // No working-directory tail: it ate input width and is already in the
    // header / /pwd. A bare `❯ ` keeps room for the task text and does not
    // read as a SECOND prompt marker next to the cursor.
    return theme.prompt('❯ ')
  }

  await refreshDynamicCommands(currentWorkdir)

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const ed: UiEditor = config.ui.tui
      ? new TuiEditor({
          prompt: buildPrompt(),
          commands: buildSlashCommands(),
          locale: currentLocale,
          alternateScreen: config.ui.alternateScreen,
        })
      : new LineEditor({
          prompt: buildPrompt(),
          commands: buildSlashCommands(),
          locale: currentLocale,
        })
    editor = ed
    ed.setTmpDir(TMP_DIR)
    // Provider badge: show which backend is answering ([Qwen]/[DeepSeek]).
    ed.setProvider(providerLabel(config.provider))
    // Header for full-screen mode (title / version / working directory).
    ed.setHeader?.({
      title: 'zames',
      version: pkgVersion || '',
      workdir: currentWorkdir,
      mouseScroll: config.ui.mouseScroll,
    })
    // Restore the input history from the previous runs and persist every new
    // entry, so Ctrl+R / arrows can recall older messages after a restart.
    ed.history = loadHistory()
    // The legacy LineEditor keeps its own browse index; the TUI seeds it from
    // the history itself.
    if (ed instanceof LineEditor) ed._histIndex = ed.history.length
    ed.onHistoryChange = (h) => saveHistory(h)
    // The token context right-aligned on the status line (above the input).
    // The editor pulls the number on every render, so it follows the live
    // DeepSeek counter (accumulated_token_usage) without a polling timer.
    ed.onContextQuery = () => browser.getLastTokenUsage()
    // Queue badge: show "⧗N" while messages are waiting to be sent after the
    // current task. Pulled on every render (like the context counter).
    ed.onQueueQuery = () => pendingQueue.length
    // Task-list summary ("tasks: 2/5") before the context counter. Pulled on
    // every render, like the queue badge.
    ed.onTasksQuery = () => todosSummary()
    // Use the configured context window for the fill percentage/color. The
    // window is PROVIDER-dependent: Qwen's is per-model (258K/1M, see
    // qwenContextWindow), DeepSeek's is the ui.contextLimit.
    ed.setContextLimit(effectiveContextLimit())
    // Toggle icons (🧠 deep thinking, 🌐 web search) before the context
    // counter. The editor pulls the live state on every render.
    ed.onToggleQuery = () => browser.getToggleStatesSync()
    // Interactive login goes through the Ink form when the TUI owns the
    // terminal: the browser's readline/askPassword would PAUSE the whole TUI
    // and fight Ink for stdin. A NAMED function so /provider can re-wire the
    // freshly created browser (the factory runs before `editor` exists, so the
    // callbacks cannot be passed there without a forward reference).
    wireLoginCallbacks = (b: unknown): void => {
      // The DeepSeek and Qwen browsers expose DIFFERENT login callback shapes
      // (DeepSeek: login+password / MFA; Qwen: email -> one-time code), so the
      // wiring is branched on the provider rather than forced through one
      // shape.
      const bb = b as {
        onLoginPrompt?: (info: {
          savedUsername: string
          hasSavedPassword?: boolean
          step?: 'email' | 'code'
        }) => Promise<{ username: string; password: string } | null | string>
        onMfaPrompt?: () => Promise<string | null>
      }
      if (config.provider === 'qwen') {
        bb.onLoginPrompt = async (info) => {
          if (!config.ui.tui || !(ed instanceof TuiEditor)) return null
          ed.pause()
          try {
            const { runTextPrompt } = await import('./tui/run-login.js')
            const isCode = info.step === 'code'
            return await runTextPrompt({
              t,
              label: isCode
                ? t('qwen.login_code_prompt')
                : t('qwen.login_email_prompt', {
                    def: info.savedUsername
                      ? ' [' + info.savedUsername + ']'
                      : '',
                  }),
              secret: isCode,
            })
          } finally {
            ed.resume()
          }
        }
      } else {
        bb.onLoginPrompt = async (info) => {
          if (!config.ui.tui || !(ed instanceof TuiEditor)) return null
          ed.pause()
          try {
            const { runLoginForm } = await import('./tui/run-login.js')
            return await runLoginForm({
              t,
              // The SAVED credentials of the ACTIVE provider (DeepSeek keeps
              // browser.auth; Qwen/GLM own their section).
              initialUsername: activeAuth().username,
              initialPassword: activeAuth().password,
              note:
                info.hasSavedPassword || info.savedUsername
                  ? t('auth.form.note_saved')
                  : undefined,
            })
          } finally {
            ed.resume()
          }
        }
      }
      bb.onMfaPrompt = async () => {
        if (!config.ui.tui || !(ed instanceof TuiEditor)) return null
        ed.pause()
        try {
          const { runTextPrompt } = await import('./tui/run-login.js')
          return await runTextPrompt({
            t,
            label: t('auth.mfa_prompt'),
            secret: true,
          })
        } finally {
          ed.resume()
        }
      }
    }
    wireLoginCallbacks(browser)
    // statusLine hook: run the configured command on its own timer (never
    // per-render — a spawn would block typing) and show its first stdout line
    // in the status line. Off when ui.statusLineCommand is empty.
    if (config.ui.statusLineCommand) {
      const statusLineInfo = (): Parameters<
        typeof runStatusLineCommand
      >[2] => ({
        chatId: currentChatId,
        queueLength: pendingQueue.length,
        tokens: browser.getLastTokenUsage(),
        contextLimit: effectiveContextLimit(),
        tasks: todosSummary(),
        locale: currentLocale,
      })
      const tick = async (): Promise<void> => {
        const line = await runStatusLineCommand(
          currentWorkdir,
          config.ui.statusLineCommand,
          statusLineInfo(),
        ).catch(() => '')
        editor?.setStatusLine(line)
      }
      void tick()
      const interval = Math.max(2000, config.ui.statusLineIntervalMs || 10_000)
      statusLineTimer = setInterval(() => void tick(), interval)
      if (typeof statusLineTimer.unref === 'function') statusLineTimer.unref()
    }
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
          hash: contentHash(image.data),
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
      const filePath = await mod.attach.resolveAttachPath(currentWorkdir, raw)
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
        hash: contentHash(res.data),
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
        const q = mod.commands.parseQueueCommand(text)
        if (q) {
          const view = renderQueueView(q.sub, pendingQueue.length, pendingQueue)
          if (view.kind === 'cleared') {
            pendingQueue.length = 0
            ed.printAbove(
              theme.system(t('msg.queue_cleared') + ' (' + view.n + ')'),
            )
          } else if (view.kind === 'empty') {
            ed.printAbove(theme.dim(t('msg.queue_empty')))
          } else if (view.kind === 'list') {
            ed.printAbove(theme.system(t('msg.queue_title')))
            for (const line of view.lines) ed.printAbove(theme.assistant(line))
            ed.printAbove(theme.dim(t('msg.queue_cleared_hint')))
          }
          return
        }
        // Toggle Deep thinking / Smart search LIVE. This only flips the
        // browser's DESIRED state and the status icons; it does not touch the
        // in-flight generation, so it is safe mid-run. The actual DeepSeek
        // toggles are applied on the next send by _applyToggles().
        const tg = mod.commands.parseLiveToggle(text)
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
        if (mod.commands.isLiveConfigCommand(text)) {
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
      // queued and only sent after the current task. In TTY the editor ALREADY
      // echoed the message text (❯ …) above the input, so we add only a compact
      // COUNT line (no repeated text) for EVERY queued message — so it is always
      // clear the message was accepted and not lost. The FIRST one additionally
      // explains what the queue is and how to inspect/clear it.
      if (ed.busy) {
        if (!queueHintShown) {
          queueHintShown = true
          ed.printAbove(theme.dim(t('msg.queued_hint')))
        }
        ed.printAbove(
          theme.user(t('msg.queued_badge', { n: pendingQueue.length })),
        )
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
        if (mod.commands.ctrlCEscalation(now - lastCtrlCAt) === 'run') {
          ed.printAbove(theme.warn(t('msg.abort_ctrlc_short')))
          browser.stopGeneration().catch(() => {})
        } else {
          ed.printAbove(theme.warn(t('msg.abort_tool_short')))
          browser._abort = true
        }
        lastCtrlCAt = now
      } else {
        // Not busy — exit. We wake takeInput() so the loop finishes. The
        // scheduler must stop too: a live /loop ticker keeps firing into the
        // queue while the process is shutting down.
        running = false
        shuttingDown = true
        stopScheduleTicker()
        if (waiter) {
          const r = waiter
          waiter = null
          r(null)
        }
      }
    }
    try {
      ed.start()
      // The key/selection hint is now a PERSISTENT row under the input box
      // (FullScreenApp), so the old one-time printAbove is redundant.
    } catch (e) {
      // A TUI mount failure must not kill the agent. We surface it and let the
      // operator retry with `ui.tui: false` if it persists; the imperative
      // callbacks stay bound to the same editor object, so no state is lost.
      console.error(
        theme.warn(
          'UI start failed (set ui.tui=false to use the legacy editor): ' +
            String(e),
        ),
      )
    }

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
      // The browser (and its startup spinner) are created ONCE, so their own
      // notices must be told about the new language explicitly — otherwise a
      // DeepSeek-side message printed later would still come out in the OLD
      // language until a restart.
      browser.setLocale(value)
      // A NON-TTY run has no editor: its only UI is the spinner, which must
      // follow the switch too (it is created per command from the locale).
      mod.createSpinner(value).setLocale?.(value)
      if (editor) {
        editor.setLocale(value)
        editor.setCommands(buildSlashCommands())
        editor.setPrompt(buildPrompt())
      }
    }
    // Repaint the WHOLE terminal in the new palette immediately. The theme
    // object is shared and mutated in place, so every later render uses it;
    // the editor is asked for a full redraw because the rows already on screen
    // (status, prompt, hints) were painted with the OLD colors.
    if (path === 'ui.inputBorder') {
      setInputBorder(value)
      if (editor) editor.setTheme?.(themeColors())
    }
    if (path === 'ui.theme') {
      const applied = applyTheme(value)
      config.ui.theme = applied
      if (editor) {
        editor.setTheme?.(themeColors())
        editor.refreshStatus()
      }
    }
    // Apply a live change to the answer width immediately, so the next
    // rendered answer uses the new width without a restart.
    if (path === 'ui.answerWidth') {
      setAnswerWidth(typeof value === 'number' ? value : Number(value) || 0)
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
    // no restart needed). ANY provider's limit matters: a /model pick rewrites
    // the active provider's own value, and a manual /config set on a non-active
    // provider must not leave the editor showing the old denominator when the
    // operator switches to it.
    if (
      (path === 'ui.contextLimit' || /\.contextLimit$/.test(path)) &&
      typeof value === 'number'
    ) {
      if (editor) {
        editor.setContextLimit(effectiveContextLimit())
        editor.refreshStatus()
      }
    }
    // Browser TIMING knobs (timeouts, retries, the send throttle) are COPIED
    // by the browser at construction, so push them onto the live instance.
    // (deepThinking/webSearch are handled above because they also repaint the
    // status icons.)
    //
    // `browser.*` knobs belong to DEEPSEEK. Each other backend copies its
    // timings from its OWN section, so applying a `browser.*` value to the
    // live Qwen/GLM instance would clobber its interval with DeepSeek's
    // 15s (the real bug: /config set browser.minSendIntervalMs rewrote the
    // Qwen send interval).
    if (path.startsWith('browser.')) {
      const b = browser as unknown as Record<string, unknown>
      if (
        config.provider === 'deepseek' &&
        applyBrowserLiveConfig(path, value, b)
      ) {
        // minSendIntervalMs feeds the send countdown the UI renders.
        if (editor) editor.refreshStatus()
      }
    }
    // The undo/checkpoint stores also copy their config at construction.
    applyStoreLiveConfig(path, value, {
      undo: undo as unknown as Record<string, unknown>,
      checkpoints: checkpoints as unknown as Record<string, unknown>,
    })
    // A provider's OWN timing knobs feed its browser constructor. The LIVE
    // fields use the SAME names, so push them there when that backend is
    // active (a no-op otherwise). Generalized from the two hardcoded qwen.*
    // paths so a new backend needs no new branch here.
    const timingMatch = path.match(
      /^(qwen|glm)\.(minSendIntervalMs|answerTimeoutMs)$/,
    )
    if (timingMatch) {
      const b = browser as unknown as Record<string, unknown>
      if (config.provider === timingMatch[1]) {
        const field = timingMatch[2]
        if (field in b) {
          b[field] = value
          if (editor) editor.refreshStatus()
        }
      }
    }
    // Switching the provider from /config cannot be applied live (it needs a
    // new browser); tell the operator instead of silently doing nothing.
    if (path === 'provider') {
      const line = t('cfg.provider_restart')
      if (editor) editor.printAbove(theme.warn(line))
      else console.log(theme.warn(line))
    }
    // headless is fixed at launch (the browser is already open); a /config set
    // only takes effect on the next run.
    if (path === 'headless') {
      const line = t('cfg.restart_required')
      if (editor) editor.printAbove(theme.dim(line))
      else console.log(theme.dim(line))
    }
    // transcript.enabled: the Transcript copies the flag at construction. A
    // false -> true flip cannot open a NEW stream mid-run, but true -> false
    // can (and should) stop writing immediately.
    if (path === 'transcript.enabled' && value === false) {
      transcript.enabled = false
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
    // GLM's flagship models (x-preview-l, glm-5.3, glm-4.6v) report
    // skip_think=false in the catalogue: thinking CANNOT be turned off, and
    // the site always sends enable_thinking=true. Flipping the switch would
    // only mislead the operator (and the icon would lie), so it is refused.
    if (
      cmd.kind === 'thinking' &&
      config.provider === 'glm' &&
      cmd.mode !== 'on'
    ) {
      const line = t('toggle.thinking_locked')
      if (editor) editor.printAbove(theme.warn(line))
      else console.log(theme.warn(line))
      return
    }
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
  // when the editor is active, otherwise to stdout. Returns which subcommand
  // ran so the main loop can START A TURN when a goal is freshly set (Claude
  // Code parity: setting a goal begins working toward it immediately).
  async function handleGoal(
    input: string,
  ): Promise<'set' | 'cleared' | 'shown' | null> {
    const g = mod.commands.parseGoalCommand(input)
    if (!g) return null
    const emit = (line: string): void => {
      if (editor) editor.printAbove(line)
      else console.log(line)
    }
    if (g.sub === 'clear') {
      sessionGoal = null
      await saveGoal(currentWorkdir, null)
      emit(theme.system(t('goal.cleared')))
      return 'cleared'
    } else if (g.sub === 'show') {
      emit(
        sessionGoal
          ? theme.system(t('goal.current', { goal: sessionGoal }))
          : theme.dim(t('goal.none')),
      )
      return 'shown'
    } else {
      sessionGoal = clampGoalCondition(g.goal)
      await saveGoal(currentWorkdir, sessionGoal)
      emit(theme.system(t('goal.set', { goal: sessionGoal })))
      return 'set'
    }
  }

  function configSetRaw(field: ConfigField, raw: string): void {
    const value = validateConfigValue(field, raw)
    writeConfigValue('home', field.path, raw)
    setConfigRuntime(field.path, value)
  }

  // Human-readable hint of the accepted values for a field, used in the error
  // message when /config set gets a bad value. Enum -> the allowed list,
  // number -> a range, boolean -> "true|false".
  function configResetField(field: ConfigField): void {
    resetConfigValue('home', field.path)
    // Reset the runtime value to the default.
    const def = getByPath(DEFAULTS, field.path)
    setConfigRuntime(field.path, def)
  }

  function configShowList(): void {
    for (const line of formatConfigList(
      CONFIG_SCHEMA,
      (p) => getByPath(config, p),
      t,
    )) {
      console.log(line)
    }
  }

  async function configOpenMenu(): Promise<void> {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) {
      configShowList()
      return
    }
    // The menu draws directly to stdout and reads keys itself. So that its
    // output doesn't overlap the editor's permanent input line, we "pause"
    // the editor for the duration of the menu and restore it afterwards.
    if (editor) editor.pause()
    const menuOpts = {
      fields: CONFIG_SCHEMA,
      t,
      get: (path: string) => getByPath(config, path),
      getDefault: (path: string) => getByPath(DEFAULTS, path),
      set: (field: ConfigField, raw: string) => configSetRaw(field, raw),
      reset: (field: ConfigField) => configResetField(field),
      // The menu itself must repaint when the THEME row changes: its widgets
      // read the shared UI map, and without a bump the operator would cycle
      // palette ids while the colors stayed those of the previous one.
      onAfterChange: (field: ConfigField) => {
        if (field.path === 'ui.theme' || field.path === 'ui.inputBorder') {
          editor?.setTheme?.(themeColors())
        }
      },
      locale: currentLocale,
    }
    try {
      // Prefer the Ink menu (nicer, resize-aware) when the TUI is enabled;
      // fall back to the legacy hand-rolled menu otherwise.
      if (config.ui.tui) {
        await runConfigMenuInk(menuOpts)
      } else {
        await runConfigMenu(menuOpts)
      }
    } catch (e) {
      console.error(theme.error(String((e as Error).message || e)))
    } finally {
      if (editor) editor.resume()
    }
  }

  /**
   * Apply a palette by id, persist it and repaint the live UI. Shared by
   * `/theme`, `/config set ui.theme` (through setConfigRuntime) and the picker,
   * so all three paths behave identically.
   */
  function applyThemeById(name: string): string {
    const applied = applyTheme(name)
    config.ui.theme = applied
    writeConfigValue('home', 'ui.theme', applied)
    if (editor) {
      editor.setTheme?.(themeColors())
      editor.refreshStatus()
    }
    return applied
  }

  // `/theme [id|list]` — a direct entry point for the palette, with a pick list
  // in the TUI. `/config set ui.theme` stays as the scriptable path.
  async function handleThemeCommand(input: string): Promise<void> {
    const arg = input.trim().slice('/theme'.length).trim()
    const names = themeNames()
    const emit = (line: string): void => {
      if (editor) editor.printAbove(line)
      else console.log(line)
    }
    if (arg === 'list' || arg === 'ls') {
      emit(
        theme.system(
          t('theme.list', { v: names.join(', ') }) +
            String.fromCharCode(10) +
            t('theme.current', { v: currentThemeName() }),
        ),
      )
      return
    }
    if (arg) {
      if (!isThemeName(arg)) {
        emit(theme.error(t('theme.unknown', { v: arg })))
        emit(theme.dim(t('theme.usage')))
        return
      }
      emit(theme.assistant(t('theme.set', { v: applyThemeById(arg) })))
      return
    }
    // No argument: a pick list in the TUI, the id list otherwise. The cursor
    // applies the palette as a LIVE preview; Esc restores the previous one.
    if (editor && config.ui.tui) {
      const before = currentThemeName()
      editor.pause()
      let picked: string | null
      try {
        const { pickThemeInk } = await import('./tui/run-theme-picker.js')
        const chosen = await pickThemeInk({
          themes: names,
          initial: before,
          locale: currentLocale,
          onPreview: (name) => {
            applyTheme(name)
            editor?.setTheme?.(themeColors())
          },
        })
        picked = chosen
      } catch {
        picked = null
      } finally {
        editor.resume()
      }
      if (picked) {
        emit(theme.assistant(t('theme.set', { v: applyThemeById(picked) })))
      } else {
        // Cancelled: the previews must not stick. Restore WITHOUT persisting.
        applyTheme(before)
        editor.setTheme?.(themeColors())
        emit(theme.system(t('theme.restored', { v: before })))
      }
      return
    }
    emit(
      theme.system(
        t('theme.list', { v: names.join(', ') }) +
          String.fromCharCode(10) +
          t('theme.current', { v: currentThemeName() }),
      ),
    )
  }

  async function handleConfigCommand(input: string): Promise<void> {
    await runConfigCommand(input, {
      t,
      print: (line) => console.log(line),
      printErr: (line) => console.error(line),
      getValue: (p) => getByPath(config, p),
      setValue: (field, raw) => configSetRaw(field, raw),
      resetField: (field) => configResetField(field),
      showList: () => configShowList(),
      openMenu: () => configOpenMenu(),
      currentLocale: () => currentLocale,
      normalizeLocale,
      localeDisplayName,
      schema: CONFIG_SCHEMA,
      homeConfigPath: CONFIG_PATHS.HOME_CONFIG,
      projectConfigPath: CONFIG_PATHS.PROJECT_CONFIG,
      shadowedKeys: shadowedConfigKeys,
    })
  }

  // Open a chat by its ChatInfo and print the restored dialogue. Shared by
  // /resume-id and the interactive /chats list, so both paths behave identically
  // (todos reloaded, prompt-resend decision, transcript event).
  const openResumedChat = async (pick: {
    id: string
    title: string
  }): Promise<void> => {
    if (editor) editor.lock(t('msg.input_locked'))
    try {
      await browser.openChat(pick.id)
      currentChatId = pick.id
      freshChatNext = false
      sendSystemPromptNext = promptOnResume()
      saveLastChat(pick.id, currentWorkdir, pick.title)
      transcript.log('resume_chat', { id: pick.id, title: pick.title })
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
      loadSessionTodos(pick.id)
      await printRestoredHistory(browser, editor, pick.id)
    } catch (e) {
      console.error(
        theme.error(t('msg.open_chat_error', { v: '' })),
        (e as Error).message,
      )
    } finally {
      if (editor) editor.unlock()
    }
  }

  // Show the recent chats in an Ink SelectList and open the chosen one.
  // Returns true when the operator picked a chat (the caller then skips the
  // text listing). Only called when the TUI owns the terminal.
  const pickChatInteractively = async (
    chats: Array<{ id: string; title: string }>,
  ): Promise<boolean> => {
    if (!editor) return false
    editor.pause()
    let picked: string | null = null
    try {
      const { selectListInk } = await import('./tui/run-select.js')
      picked = await selectListInk({
        title: t('chats.pick_title'),
        locale: currentLocale,
        items: chats.map((c, i) => ({
          value: c.id,
          label: String(i + 1).padStart(2, ' ') + '. ' + c.title,
          detail: c.id.slice(0, 8) + '…',
        })),
      })
    } catch {
      picked = null
    } finally {
      editor.resume()
    }
    if (!picked) return false
    const pick = chats.find((c) => c.id === picked)
    if (!pick) return false
    await openResumedChat(pick)
    return true
  }

  // Show the saved SESSIONS in an Ink SelectList and resume the chosen one.
  // Sessions carry the full chat id (unlike the /chats sidebar), so this is
  // the safe resume path; it reuses openResumedChat for identical behavior.
  const pickSessionInteractively = async (
    sessions: Array<{ id: string; title?: string; workdir?: string }>,
  ): Promise<boolean> => {
    if (!editor) return false
    editor.pause()
    let picked: string | null = null
    try {
      const { selectListInk } = await import('./tui/run-select.js')
      picked = await selectListInk({
        title: t('sessions.pick_title'),
        locale: currentLocale,
        items: sessions.map((s, i) => ({
          value: s.id,
          label:
            String(i + 1).padStart(2, ' ') +
            '. ' +
            (s.title || s.id.slice(0, 8)),
          detail:
            s.id.slice(0, 8) +
            '…' +
            (s.workdir ? ' [' + dirLabel(s.workdir) + ']' : ''),
        })),
      })
    } catch {
      picked = null
    } finally {
      editor.resume()
    }
    if (!picked) return false
    const pick = sessions.find((s) => s.id === picked)
    if (!pick) return false
    await openResumedChat({ id: pick.id, title: pick.title || '' })
    return true
  }

  while (running) {
    let input: string | null
    let inputAttachments: Array<{ path: string; name: string; mime: string }> =
      []
    // Set by `/goal <condition>` to fall through into a task turn with this
    // text instead of returning to the prompt (Claude Code starts a turn the
    // moment a goal is set). Reset every iteration because it is declared here.
    let taskOverride: string | null = null
    try {
      if (editor) {
        editor.setPrompt(buildPrompt())
        const msg = await takeInput()
        input = msg ? msg.text : null
        inputAttachments = msg?.attachments || []
      } else {
        let tail
        // The non-TTY fallback prompt mirrors buildPrompt(): bare, no dir.
        if (reviewMode) {
          tail =
            theme.dim('(') +
            theme.warn(t('prompt.review')) +
            theme.dim(':') +
            theme.dir(reviewMode.snapName) +
            theme.dim(') ')
        }
        input = await promptOnce(theme.prompt('❯ ') + tail)
      }
    } catch {
      break
    }

    const trimmed = (input || '').trim()
    if (!trimmed) continue

    const lower = trimmed.toLowerCase()

    if (['/exit', '/quit', 'exit', 'quit'].includes(lower)) break

    // Dev-only commands (backlog / self-review) must not run outside dev mode.
    // Hiding them from /help is not enough: a user could type the command by
    // hand, and it would rewrite their project's BACKLOG.md or snapshot src/.
    if (!devMode) {
      const devCmd = mod.commands.isDevOnlyCommand(lower)
      if (devCmd) {
        console.error(theme.warn(t('msg.dev_only', { v: devCmd })))
        continue
      }
    }

    // `!command` — run a shell command directly, without asking the model
    // (like Claude Code's bash mode). The same sandbox guard as the Bash tool
    // applies, so a direct command cannot leave the project either.
    if (trimmed.startsWith('!')) {
      const cmd = trimmed.slice(1).trim()
      if (!cmd) {
        console.error(theme.warn(t('shell.empty')))
        continue
      }
      try {
        assertCommandInsideRoot(currentWorkdir, cmd)
      } catch (e) {
        console.error(theme.error((e as Error).message))
        continue
      }
      transcript.log('shell_command', { command: cmd })
      if (editor) editor.lock(t('shell.running'))
      try {
        const out = await runShell(currentWorkdir, cmd)
        console.log(theme.system(out))
        transcript.log('shell_result', { command: cmd, result: out })
      } finally {
        if (editor) editor.unlock()
      }
      continue
    }

    if (
      lower === '/help' ||
      lower === 'help' ||
      lower.startsWith('/help ') ||
      lower.startsWith('help ')
    ) {
      const topic = trimmed.replace(/^\/?help\s*/i, '').trim()
      if (!topic) {
        printHelp()
      } else {
        // /help <command> — print the full description of ONE command instead
        // of making the operator scroll the whole list.
        const q = '/' + topic.replace(/^\//, '').toLowerCase()
        const match = buildSlashCommands().filter(
          (c) =>
            c.name.toLowerCase() === q ||
            c.name.toLowerCase().startsWith(q + ' '),
        )
        if (!match.length) {
          console.error(theme.warn(t('help.no_topic', { v: topic })))
        } else {
          for (const c of match) {
            console.log(
              theme.assistant(c.name) + theme.dim('  ' + c.description),
            )
          }
        }
      }
      continue
    }

    if (['/new', '/clear', 'new'].includes(lower)) {
      if (editor) editor.lock(t('msg.input_locked'))
      try {
        await browser.newChat()
        freshChatNext = false
        sendSystemPromptNext = true
        // A new chat starts a fresh checklist: keeping the old tasks would
        // label them as "restored" in a chat that never saw them.
        resetTodos(todoStore)
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
          locale: currentLocale,
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
            maxIterations: currentMaxIter(),
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
        await mod.selfList({ config, locale: currentLocale })
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

    if (lower === '/chats' || lower.startsWith('/chats ')) {
      const filter = trimmed.slice('/chats'.length).trim().toLowerCase()
      const spin = editor || mod.createSpinner(currentLocale)
      if (editor) editor.lock(t('msg.input_locked'))
      spin.thinking()
      try {
        const all = await browser.listChats(30)
        // Hide subagent chats: they are real DeepSeek chats, but they are
        // internal context-isolation artifacts whose report already lives in
        // the parent chat, so resuming one is never what the operator wants.
        // The scraper runs inside the page and cannot localize: a row without
        // text comes back with an EMPTY title, so the label is applied HERE
        // (one place, in the operator's language) instead of a hardcoded one.
        lastChats = all
          .filter((c) => !isInternalChat(c.id))
          .map((c) => ({
            ...c,
            title: c.title && c.title.trim() ? c.title : t('chats.untitled'),
          }))
        spin.stop()
        // An optional query filters by title (substring, case-insensitive),
        // so a long chat list does not have to be scanned by eye.
        const shown = filter
          ? lastChats.filter((c) => c.title.toLowerCase().includes(filter))
          : lastChats
        if (!shown.length) {
          console.log(theme.system(t('chats.none_hint')))
        } else {
          // In the TUI, open a real SELECT LIST (like /model) instead of
          // dumping text: pick a chat and it opens directly. The text path
          // below stays for non-TTY / the legacy editor.
          const canPick =
            editor && 'isTui' in editor && config.ui.tui && !filter
          if (canPick && editor) {
            const openChat = await pickChatInteractively(shown)
            if (openChat) continue
          }
          console.log(theme.system(t('chats.recent')))
          // The number is the index in the FULL list (a filter only narrows
          // the VIEW), and the full id in brackets is what /resume-id takes.
          for (const c of shown) {
            const idx = lastChats.indexOf(c)
            const n = String(idx + 1).padStart(2, ' ')
            console.log(
              `  ${theme.user(n)}. ${c.title}  ${theme.system('(' + c.id.slice(0, 8) + '…)')}`,
            )
          }
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

    if (lower === '/provider' || lower.startsWith('/provider ')) {
      const intent = parseProviderIntent(
        trimmed.slice('/provider'.length),
        config.provider,
      )
      if (intent.kind === 'status') {
        const model = providerModelOf(config.provider) || '(default)'
        console.log(
          theme.system(
            t('provider.status', {
              v: config.provider,
              m: model,
              auth: authMarkerExists() ? 'yes' : 'no',
            }),
          ),
        )
        continue
      }
      if (intent.kind === 'login') {
        try {
          await browser.waitForLogin()
          console.log(theme.system(t('provider.login_done')))
        } catch (e) {
          console.error(theme.warn((e as Error).message))
        }
        continue
      }
      if (intent.kind === 'switch') {
        const arg = intent.provider
        const from = config.provider
        if (intent.same) {
          console.log(theme.system(t('provider.switched', { v: arg })))
          continue
        }
        // Is there anything worth carrying over? A FRESH/EMPTY chat has no
        // context to summarize, so switching it is a pure URL/backend change:
        // summarizing an empty chat used to post a useless "please compact"
        // request into a brand-new chat (a real complaint). We only build a
        // handoff when the chat actually has messages.
        let chatHasMessages = false
        if (browser.fetchChatMessages) {
          const cid = await browser.getCurrentChatId().catch(() => null)
          if (cid) {
            const all = await browser.fetchChatMessages(cid).catch(() => [])
            chatHasMessages =
              mod.commands.trimRestoredMessages(all, 0).length > 0
          }
        }

        if (chatHasMessages) {
          // CARRY-OVER: a chat id only exists on its own backend, so switching
          // providers loses the conversation. Summarize the CURRENT chat (still
          // on the OLD browser object) and persist a handoff for the target; it
          // is posted as the first message once the new provider is live.
          if (editor) editor.lock(t('msg.input_locked'))
          try {
            const spin = editor || mod.createSpinner(currentLocale)
            spin.thinking()
            let summary = ''
            try {
              const answer = await browser.ask(
                mod.commands.buildCompactPrompt(currentLocale),
                {
                  agent: true,
                  timeout: providerAnswerTimeoutMs(),
                },
              )
              const trimmed = String(answer || '').trim()
              if (mod.commands.isUsableCompactSummary(trimmed))
                summary = trimmed
            } catch (e) {
              if (debug)
                console.error('handoff summary failed:', (e as Error).message)
            }
            // Fall back to the LOCAL history when the model summary is unusable.
            if (!summary && browser.fetchChatMessages) {
              const cid = await browser.getCurrentChatId().catch(() => null)
              const all = cid
                ? await browser.fetchChatMessages(cid).catch(() => [])
                : []
              const msgs = mod.commands.trimRestoredMessages(all, 0)
              if (msgs.length) {
                summary = mod.commands.formatRestoredHistory(msgs, {
                  limit: 40,
                })
              }
            }
            spin.stop()
            if (summary) {
              saveProviderHandoff({
                provider: arg,
                from,
                workdir: currentWorkdir,
                summary,
                task: lastTaskText || undefined,
                createdAt: new Date().toISOString(),
              })
              console.log(theme.system(t('provider.handoff_saved', { v: arg })))
            } else {
              console.log(theme.warn(t('provider.handoff_empty')))
            }
          } finally {
            if (editor) editor.unlock()
          }
        }

        // Tag the current session with the OLD provider before switching.
        if (currentChatId) saveLastChat(currentChatId, currentWorkdir)

        // Persist the choice FIRST so a crash mid-switch still remembers it.
        config.provider = arg
        setProviderEnabledFlag(arg)
        try {
          writeConfigValue('home', 'provider', arg)
        } catch {}

        // LIVE SWITCH: dispose the old backend and open the new one in place,
        // so the operator does not have to restart zames. The chat is NOT
        // resumable across providers (different chat ids), so the new backend
        // starts a FRESH chat and the handoff (if any) is posted with the next
        // task.
        if (editor) editor.lock(t('msg.input_locked'))
        try {
          console.log(theme.system(t('provider.switching', { v: arg })))
          // Launch the NEW backend FIRST; only close the old one once it is up.
          // If we closed the old browser before the new one launched and the
          // launch failed, `browser` would point at a dead instance and every
          // later command would break.
          const nextBrowser = createProviderBrowser(arg, onContextLimit)
          // Wire the Ink login BEFORE waitForLogin(), or the new backend would
          // fall back to readline and pause the TUI for its sign-in.
          wireLoginCallbacks(nextBrowser)
          await nextBrowser.launch()
          await nextBrowser.waitForLogin()
          const oldBrowser = browser
          browser = nextBrowser
          await oldBrowser.close().catch(() => {})
          // The new backend has no chat yet.
          currentChatId = await browser.getCurrentChatId().catch(() => null)
          if (editor) {
            editor.setProvider(providerLabel(arg))
            // The context window is provider-specific: without this the status
            // bar kept showing the OLD backend's denominator after a switch.
            editor.setContextLimit(effectiveContextLimit())
          }
          try {
            warnUiHealth(await browser.probeUiHealth())
          } catch {}
          console.log(theme.system(t('provider.switched', { v: arg })))
        } catch (e) {
          // The new backend did not come up: keep the OLD one active so the
          // session keeps working, and roll the persisted choice back.
          config.provider = from
          setProviderEnabledFlag(from)
          try {
            writeConfigValue('home', 'provider', from)
          } catch {}
          console.error(
            theme.warn(
              t('provider.switch_failed', {
                v: arg,
                error: (e as Error).message,
              }),
            ),
          )
        } finally {
          if (editor) editor.unlock()
        }
        continue
      }
      console.error(theme.warn(providerUsageMessage(t)))
      continue
    }

    if (lower === '/model' || lower.startsWith('/model ')) {
      const arg = trimmed.slice('/model'.length).trim()
      // `/model` is available to ANY provider that exposes a model picker
      // (Qwen, GLM). DeepSeek has none, so the command is hidden from the
      // hints there and only explains itself when typed by hand.
      const intent = parseModelIntent(config.provider, arg, t)
      if (intent.kind === 'unsupported') {
        console.log(theme.system(intent.message))
        continue
      }
      const section = providerConfigSection(config.provider)
      const sectionObj = activeProviderSection()
      if (!section || !sectionObj) continue
      const curModel = String(sectionObj.model || '')
      const qb = browser as unknown as {
        listModels?: () => Promise<Array<{ id: string; name: string }>>
        model?: string
      }
      if (intent.kind === 'list') {
        const models = qb.listModels ? await qb.listModels() : []
        if (!models.length) {
          console.log(theme.system(emptyModelListMessage(t)))
          continue
        }
        // In the TUI, open a proper SELECT LIST instead of dumping text.
        if (editor && 'isTui' in editor && config.ui.tui) {
          if (editor.pause) editor.pause()
          let picked: string | null
          try {
            const { selectListInk } = await import('./tui/run-select.js')
            picked = await selectListInk({
              title: t('model.pick_title', {
                provider: providerLabel(config.provider),
              }),
              initial: curModel || models[0].id,
              items: models.map((m) => ({
                value: m.id,
                label: m.name || m.id,
                detail: m.id === curModel ? t('tui.list.current') : m.id,
              })),
              locale: currentLocale,
            })
          } catch {
            picked = null
          } finally {
            if (editor.resume) editor.resume()
          }
          if (picked) {
            sectionObj.model = picked
            if (typeof qb.model === 'string') qb.model = picked
            // Derive the context window from the picked model: windows are
            // per-model, and this number is the denominator of the
            // auto-compact threshold. The operator's manual
            // `/config set <provider>.contextLimit` still wins afterwards
            // (this only runs on an explicit pick).
            applyModelContextLimit(picked)
            if (editor) {
              editor.setContextLimit(effectiveContextLimit())
              editor.refreshStatus()
            }
            try {
              writeConfigValue('home', section + '.model', picked)
            } catch {}
            console.log(
              theme.system(
                t('model.set', {
                  provider: providerLabel(config.provider),
                  v: picked,
                }),
              ),
            )
          }
          continue
        }
        const lines = models.map((m) => `  ${m.id}  —  ${m.name}`).join(NL)
        console.log(theme.system(t('model.list', { v: lines })))
        continue
      }
      sectionObj.model = intent.model
      if (typeof qb.model === 'string') qb.model = intent.model
      applyModelContextLimit(intent.model)
      if (editor) {
        editor.setContextLimit(effectiveContextLimit())
        editor.refreshStatus()
      }
      try {
        writeConfigValue('home', section + '.model', arg)
      } catch {}
      console.log(
        theme.system(
          t('model.set', {
            provider: providerLabel(config.provider),
            v: intent.model,
          }),
        ),
      )
      continue
    }

    if (lower === '/chat') {
      if (currentChatId) {
        console.log(theme.system(t('chats.current_id', { v: currentChatId })))
        console.log(
          theme.system(`URL: ${browserProviderUrl()}/${currentChatId}`),
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

    if (
      lower === '/sessions' ||
      lower === '/session' ||
      lower.startsWith('/sessions ') ||
      lower.startsWith('/session ')
    ) {
      const filter = trimmed
        .replace(/^\/sessions?/i, '')
        .trim()
        .toLowerCase()
      // /sessions <query> filters by title or workdir (substring). Sorted by
      // recency already (listSessions).
      const all = filterSessions(listSessions(), filter)
      console.log(theme.system(t('sessions.dir', { v: sessionsDir() })))
      if (!all.length) {
        console.log(theme.system(t('sessions.none')))
      } else {
        // In the TUI, open a SELECT LIST and resume the chosen session
        // directly (same behavior as /chats), instead of only listing ids.
        const canPick = editor && 'isTui' in editor && config.ui.tui && !filter
        if (canPick && editor) {
          const opened = await pickSessionInteractively(all)
          if (opened) continue
        }
        all.forEach((s, i) => {
          const n = String(i + 1).padStart(2, ' ')
          const mark = s.id === currentChatId ? theme.user(' *') : ''
          const title = s.title ? `  ${s.title}` : ''
          const wd = s.workdir ? theme.dim(`  [${dirLabel(s.workdir)}]`) : ''
          const age = mod.commands.formatRelativeTime(s.updatedAt, t)
          const ageText = age ? theme.dim('  ' + age) : ''
          console.log(
            `  ${theme.user(n)}. ${s.id.slice(0, 8)}…${title}${wd}${ageText}${mark}`,
          )
        })
        console.log(theme.system(t('sessions.restore_hint')))
      }
      continue
    }

    if (lower === '/last') {
      // Quick resume of the last chat for THIS working directory — otherwise
      // finding it meant /chats (a network fetch) or copying the id.
      const last = loadLastSession(currentWorkdir, config.provider)
      if (!last || !last.id) {
        console.error(theme.error(t('sessions.none_here')))
        continue
      }
      if (editor) editor.lock(t('msg.input_locked'))
      try {
        if (editor) editor.clearScreen()
        console.log(theme.system(t('msg.opening_chat', { id: last.id })))
        await browser.openChat(last.id)
        currentChatId = last.id
        freshChatNext = false
        sendSystemPromptNext = promptOnResume()
        saveLastChat(last.id, currentWorkdir, last.title)
        transcript.log('resume_chat', { id: last.id, title: last.title })
        console.log(theme.assistant(t('msg.chat_opened')))
        loadSessionTodos(last.id)
        await printRestoredHistory(browser, editor, last.id)
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

    if (lower.startsWith('/resume-id ')) {
      const id = parseResumeId(trimmed.slice('/resume-id'.length))
      if (!id) {
        console.error(theme.error(t('sessions.resume_id_usage')))
        continue
      }
      // A chat id only exists on the backend that created it, so opening a
      // session saved by ANOTHER provider fails deep inside the browser with a
      // confusing error. Refuse up front and name the right /provider command.
      const refusal = resumeProviderRefusal(readSession(id), config.provider, t)
      if (refusal) {
        console.error(theme.error(refusal))
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
        loadSessionTodos(id)
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
      const sub = await handleGoal(trimmed)
      // Claude Code parity: setting a goal STARTS a turn immediately, with the
      // condition itself as the directive (no separate prompt needed). The
      // completion loop in runTask() then keeps working until the evaluator
      // reports MET/IMPOSSIBLE. We fall through to the regular task path with
      // an override task text instead of returning to the prompt.
      if (sub === 'set' && sessionGoal) {
        taskOverride =
          'Work toward this completion goal until it is satisfied. ' +
          'Do not call respond with a final summary until the condition is met.'
      } else {
        continue
      }
    }

    if (lower === '/loop' || lower.startsWith('/loop ')) {
      const rest = trimmed.slice('/loop'.length).trim()
      const sp = rest.indexOf(' ')
      const intervalStr = sp === -1 ? rest : rest.slice(0, sp)
      const taskStr = sp === -1 ? '' : rest.slice(sp + 1).trim()
      const ms = parseInterval(intervalStr)
      if (!ms && intervalStr) {
        // Say WHY the job was not added. A bare `10` is not a typo the agent
        // can spot: it IS a valid interval (10 SECONDS), while an operator who
        // meant ten minutes needs the `m` suffix.
        console.error(theme.error(t('sched.interval_typo', { v: intervalStr })))
        continue
      }
      if (!ms || !taskStr) {
        console.error(theme.error(t('sched.loop_usage')))
        continue
      }
      // A very short loop (e.g. "/loop 1s ...") would keep the agent sending
      // back-to-back and hit the rate limit. Enforce a floor; the send throttle
      // is 15s, so anything faster is pointless anyway.
      if (ms < MIN_LOOP_MS) {
        console.error(
          theme.error(
            t('sched.loop_too_short', {
              min: formatInterval(MIN_LOOP_MS),
            }),
          ),
        )
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
      // Tell the operator WHEN it will actually run. A scheduled task never
      // interrupts a running turn: it is queued and starts only when the
      // agent is idle (or right after the current task). The bare "added"
      // line made a first /loop look like a no-op, so the operator re-sent the
      // task by hand (the very report this line answers).
      console.log(theme.dim(t('sched.added_hint')))
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
      console.log(theme.dim(t('sched.added_hint')))
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
        console.log(theme.assistant(formatJobLine(j, Date.now())))
      }
      console.log(theme.dim(t('sched.remove_hint')))
      continue
    }

    if (lower === '/queue' || lower.startsWith('/queue ')) {
      const q = mod.commands.parseQueueCommand(trimmed)
      const view = renderQueueView(
        q ? q.sub : null,
        pendingQueue.length,
        pendingQueue,
      )
      if (view.kind === 'usage') {
        console.error(theme.error(t('msg.queue_usage')))
        continue
      }
      if (view.kind === 'cleared') {
        pendingQueue.length = 0
        console.log(theme.system(t('msg.queue_cleared') + ' (' + view.n + ')'))
        continue
      }
      if (view.kind === 'empty') {
        console.log(theme.dim(t('msg.queue_empty')))
        continue
      }
      console.log(theme.system(t('msg.queue_title')))
      for (const line of view.lines) console.log(theme.assistant(line))
      console.log(theme.dim(t('msg.queue_cleared_hint')))
      continue
    }

    if (lower === '/tasks') {
      const items = getTodos(todoStore)
      if (!items.length) {
        console.log(theme.dim(t('tasks.empty')))
        continue
      }
      console.log(theme.system(t('tasks.title')))
      // Skip the "Todo list (N/M done):" header line from renderTodos — the
      // /tasks title already says it.
      for (const line of renderTodos(items).split(NL).slice(1)) {
        console.log(theme.assistant(line))
      }
      continue
    }

    if (lower.startsWith('/thinking') || lower.startsWith('/web')) {
      const tg = mod.commands.parseLiveToggle(trimmed)
      if (tg) {
        applyLiveToggle(tg)
        continue
      }
    }

    if (lower === '/plan' || lower.startsWith('/plan ')) {
      const arg = trimmed.slice('/plan'.length).trim().toLowerCase()
      if (arg === '' || arg === 'toggle') planMode = !planMode
      else if (arg === 'on' || arg === '1' || arg === 'true' || arg === 'вкл')
        planMode = true
      else if (
        arg === 'off' ||
        arg === '0' ||
        arg === 'false' ||
        arg === 'выкл'
      )
        planMode = false
      else {
        console.error(theme.warn(t('msg.unknown_cmd', { v: trimmed })))
        continue
      }
      const line = t(planMode ? 'plan.on' : 'plan.off')
      if (editor) editor.printAbove(theme.system(line))
      else console.log(theme.system(line))
      continue
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
      for (const w of st.warnings)
        console.log(theme.warn('  ' + t(w.key, w.params)))
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
          const src = s.path ? s.source : 'built-in'
          console.log(
            '  ' +
              theme.user('/' + s.name) +
              theme.dim(' [' + src + '] ') +
              (s.description || theme.dim(t('common.none'))),
          )
          if (s.path) console.log(theme.dim('      ' + s.path))
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

    // `/remember <text>` — append a durable note to the project MEMORY.md.
    // Claude Code has the same idea (# shortcut): a fact worth keeping across
    // sessions is written to disk instead of living only in this chat. We
    // write to the workdir's own MEMORY.md (the deepest file the loader reads)
    // and create it when missing.
    if (lower === '/remember' || lower.startsWith('/remember ')) {
      const note = trimmed.slice('/remember'.length).trim()
      if (!note) {
        console.error(theme.warn(t('remember.usage')))
        continue
      }
      const memFile = path.join(currentWorkdir, 'MEMORY.md')
      const stamp = new Date().toISOString().slice(0, 10)
      let body: string
      try {
        body = await fs.readFile(memFile, 'utf-8')
      } catch {
        body = '# MEMORY\n\nDurable notes accumulated across sessions.\n'
      }
      if (body.length && !body.endsWith(NL)) body += NL
      body += NL + '- (' + stamp + ') ' + note + NL
      await fs.writeFile(memFile, body, 'utf-8')
      transcript.log('remember', { note, file: memFile })
      console.log(theme.assistant(t('remember.saved', { v: memFile })))
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

      const initTools = mod.createTools(currentWorkdir, {
        undo,
        todos: todoStore,
      })
      if (editor) editor.busy = true
      console.log(theme.system(t('init.analyzing')))
      try {
        await mod.runAgentLoop({
          browser,
          tools: initTools,
          task: initTask,
          workdir: currentWorkdir,
          maxIterations: currentMaxIter(),
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
      const statusToggles = browser.getToggleStatesSync()
      const statusLines = formatStatus(
        {
          workdir: currentWorkdir,
          reviewMode: reviewMode ? reviewMode.snapName : null,
          origDir: reviewMode ? reviewMode.originalWorkdir : null,
          chatId: currentChatId,
          freshNext: freshChatNext,
          promptNext: sendSystemPromptNext,
          lastChat: loadLastChat(currentWorkdir),
          sessionsDir: sessionsDir(),
          devMode,
          maxIterations: currentMaxIter(),
          headless,
          debug,
          deepThinking: statusToggles.deepThinking,
          webSearch: statusToggles.webSearch,
          undo: config.undo.enabled,
          checkpoint: config.checkpoint.enabled,
          transcriptFile: transcript.file,
          goal: sessionGoal,
          localeName: localeDisplayName(currentLocale),
          mcpToolCount: mcpPool ? mcpPool.status().toolCount : null,
          tokenUsage: browser.getLastTokenUsage(),
        },
        t,
      )
      for (const line of statusLines) console.log(theme.system(line))
      continue
    }

    if (lower === '/config' || lower.startsWith('/config ')) {
      await handleConfigCommand(trimmed)
      continue
    }

    if (lower === '/theme' || lower.startsWith('/theme ')) {
      await handleThemeCommand(trimmed)
      continue
    }

    if (lower === '/transcript') {
      console.log(theme.system(transcript.file || t('common.off')))
      continue
    }

    if (lower === '/context') {
      // Show what buildSystemPrompt() injects (AGENTS/MEMORY/skills/commands)
      // so the operator can see why the context is large. Best-effort: a broken
      // file must not break the command.
      try {
        const { loadProjectContext } = await import('./context.js')
        const ctx = await loadProjectContext(currentWorkdir)
        const sysLen = mod.buildSystemPrompt({
          workdir: currentWorkdir,
          tools: mod.createTools(currentWorkdir, { undo, todos: todoStore }),
          locale: currentLocale,
          context: ctx,
        }).length
        console.log(
          theme.system(
            renderContextReport(
              {
                agents: ctx.agents,
                memory: ctx.memory,
                skills: ctx.skills,
                commands: ctx.commands,
              },
              { systemPromptChars: sysLen },
              t,
            ),
          ),
        )
      } catch (e) {
        console.error(theme.error((e as Error).message))
      }
      continue
    }

    if (lower === '/rename' || lower.startsWith('/rename ')) {
      const title = trimmed.slice('/rename'.length).trim()
      if (!title) {
        console.log(theme.dim(t('rename.usage')))
        continue
      }
      if (!currentChatId) {
        currentChatId = await browser.getCurrentChatId()
      }
      if (!currentChatId) {
        console.error(theme.error(t('chats.not_created')))
        continue
      }
      saveLastChat(currentChatId, currentWorkdir, title)
      console.log(theme.assistant(t('rename.done', { v: title })))
      continue
    }

    if (lower === '/copy') {
      if (!lastAssistantMessage) {
        console.log(theme.dim(t('copy.none')))
        continue
      }
      const res = writeClipboardText(lastAssistantMessage)
      if (res.ok) {
        console.log(theme.assistant(t('copy.done', { tool: res.via })))
      } else {
        console.error(theme.warn(t('copy.failed', { tool: res.via })))
      }
      continue
    }

    if (lower === '/retry') {
      if (!lastTaskText) {
        console.log(theme.dim(t('retry.none')))
        continue
      }
      console.log(theme.system(t('retry.running')))
      // Re-send the last task into the SAME chat (no new chat, no system
      // prompt), so a truncated/empty answer can be retried cheaply.
      const baseTools = mod.createTools(currentWorkdir, {
        undo,
        todos: todoStore,
        readOnly: planMode,
      })
      const tools = mergeTools(baseTools, mcpPool?.tools, planMode)
      if (editor) editor.busy = true
      try {
        await mod.runTask(
          runTaskDeps(),
          browser,
          tools,
          lastTaskText,
          currentWorkdir,
          {
            transcript,
            freshChat: false,
            sendSystemPrompt: false,
            queue: pendingQueue,
            ui: editor || null,
            onChatReady: (chatId) => {
              if (chatId) {
                currentChatId = chatId
                saveLastChat(chatId, currentWorkdir)
              }
            },
            contextLimit: effectiveContextLimit(),
            getTokenUsage: () => browser.getLastTokenUsage(),
            goal: sessionGoal,
          },
        )
      } finally {
        if (editor) editor.busy = false
      }
      continue
    }

    if (lower === '/diff' || lower.startsWith('/diff ')) {
      const staged = lower.indexOf('--staged') !== -1
      const { runGitArgs } = await import('./gitTools.js')
      const probe = await runGitArgs(
        ['rev-parse', '--is-inside-work-tree'],
        currentWorkdir,
        5000,
      )
      if (probe.trim() !== 'true') {
        console.error(theme.error(t('diff.not_repo')))
        continue
      }
      const out = await runGitArgs(
        mod.commands.diffGitArgs(staged),
        currentWorkdir,
        20_000,
      )
      console.log(
        theme.system(mod.commands.formatDiff(out, { maxLines: 400 }, t)),
      )
      continue
    }

    if (lower === '/diffstat' || lower.startsWith('/diffstat ')) {
      const staged = lower.indexOf('--staged') !== -1
      const { runGitArgs } = await import('./gitTools.js')
      const probe = await runGitArgs(
        ['rev-parse', '--is-inside-work-tree'],
        currentWorkdir,
        5000,
      )
      if (probe.trim() !== 'true') {
        console.error(theme.error(t('diff.not_repo')))
        continue
      }
      const out = await runGitArgs(
        mod.commands.diffStatGitArgs(staged),
        currentWorkdir,
        20_000,
      )
      console.log(
        theme.system(mod.commands.formatDiffStat(out, { maxLines: 60 }, t)),
      )
      continue
    }

    if (lower === '/limits') {
      const { readSendEvents, summarizeSends, sendLogPath } =
        await import('./send-telemetry.js')
      const logsDir = config.transcript.dir
      const events = readSendEvents(logsDir, config.provider)
      if (!events.length) {
        console.log(
          theme.system(
            limitsEmptyMessage(sendLogPath(logsDir, config.provider), t),
          ),
        )
      } else {
        const st = summarizeSends(events)
        for (const line of formatLimits(
          st,
          {
            providerLabel: providerLabel(config.provider),
            intervalMs: browser.sendIntervalMs(),
            adaptive: providerAdaptiveThrottle(config.provider),
          },
          t,
        )) {
          // The title is printed bare; the counters are indented under it.
          console.log(
            line.kind === 'title' ? theme.system(line.text) : '  ' + line.text,
          )
        }
      }
      continue
    }

    if (lower === '/cost' || lower === '/usage') {
      let stats = mod.commands.summarizeTranscript([])
      if (transcript.file) {
        try {
          const body = await fs.readFile(transcript.file, 'utf-8')
          stats = mod.commands.summarizeTranscript(
            mod.commands.parseTranscript(body),
          )
        } catch {
          // best-effort
        }
      }
      console.log(
        theme.system(
          mod.commands.renderCost(
            stats,
            transcript.file,
            browser.getLastTokenUsage(),
            t,
          ),
        ),
      )
      continue
    }

    if (lower === '/export' || lower.startsWith('/export ')) {
      const arg = trimmed.slice('/export'.length).trim()
      const target = arg
        ? path.resolve(currentWorkdir, arg)
        : mod.commands.defaultExportPath(currentWorkdir)
      const rel = path.relative(sandboxRoot, target)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        console.error(theme.error(t('export.outside')))
        continue
      }
      let entries: ReturnType<typeof mod.commands.parseTranscript> = []
      if (transcript.file) {
        try {
          entries = mod.commands.parseTranscript(
            await fs.readFile(transcript.file, 'utf-8'),
          )
        } catch {
          entries = []
        }
      }
      const md = mod.commands.formatExport(entries, {
        chatId: currentChatId,
        workdir: currentWorkdir,
      })
      await fs.writeFile(target, md, 'utf-8')
      console.log(theme.assistant(t('export.done', { v: target })))
      continue
    }

    if (lower === '/doctor') {
      const { runGitArgs } = await import('./gitTools.js')
      let gitOk = false
      let gitBranch: string | null = null
      try {
        const probe = await runGitArgs(
          ['rev-parse', '--is-inside-work-tree'],
          currentWorkdir,
          5000,
        )
        gitOk = probe.trim() === 'true'
        if (gitOk) {
          gitBranch = (
            await runGitArgs(['branch', '--show-current'], currentWorkdir, 5000)
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
      // Probe the DeepSeek UI so a redesign shows up as a /doctor row instead
      // of a task that hangs on a missing input. Best-effort.
      const uiHealth = await browser.probeUiHealth().catch(() => null)
      console.log(
        theme.system(
          mod.commands.renderDoctor(
            {
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
              contextLimit: effectiveContextLimit(),
              hasOrigin: gitOk
                ? (await runGitArgs(['remote'], currentWorkdir, 5000)).includes(
                    'origin',
                  )
                : undefined,
              // The ACTIVE browser's own interval: a per-provider timing
              // (Qwen 4s, GLM 0) used to be reported as DeepSeek's 15s.
              minSendIntervalMs: browser.sendIntervalMs(),
              adaptiveThrottle: providerAdaptiveThrottle(config.provider),
              displayAvailable: canShowWindow(
                process.env as Record<string, string | undefined>,
                process.platform,
              ),
              sshRemote: !!(process.env.SSH_CONNECTION || process.env.SSH_TTY),
              headless: !!headless,
              headlessUaCached: await headlessUACacheReady().catch(() => false),
              uiPresent: uiHealth?.present,
              uiMissing: uiHealth?.missing,
              uiMissingCritical: uiHealth?.missingCritical,
              provider: config.provider,
              providerModel: providerConfigSection(config.provider)
                ? providerModelOf(config.provider)
                : undefined,
            },
            t,
          ),
        ),
      )
      continue
    }

    if (lower === '/add-dir' || lower.startsWith('/add-dir ')) {
      const arg = trimmed.slice('/add-dir'.length).trim()
      const res = mod.commands.resolveExtraDir(arg, currentWorkdir, t)
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
        providerLabel: providerLabel(config.provider),
        currentChatId,
        workdir: currentWorkdir,
        locale: currentLocale,
        task: task ?? undefined,
        transcript,
        ui: editor,
        buildSystemPrompt: mod.buildSystemPrompt,
        tools: mod.createTools(currentWorkdir, { undo, todos: todoStore }),
        answerTimeoutMs: providerAnswerTimeoutMs(),
        fallbackLimit: COMPACT_FALLBACK_LIMIT,
        selfImprovement: devMode,
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

    if (lower === '/improve' || lower.startsWith('/improve ')) {
      // Backlog-driven self-improvement: pick the next open BACKLOG item (or a
      // specific id) and run the standard task loop on it. The agent reads
      // BACKLOG.md itself for the details, so a FRESH agent needs no external
      // context — this is the reproducible hand-off path.
      const arg = trimmed.slice('/improve'.length).trim()
      let backlogText: string
      try {
        backlogText = await fs.readFile(
          path.join(currentWorkdir, 'BACKLOG.md'),
          'utf-8',
        )
      } catch {
        console.error(theme.warn(t('improve.no_backlog')))
        continue
      }
      const items = mod.commands.parseBacklogItems(backlogText)
      const item = mod.commands.nextBacklogItem(items, arg || undefined)
      if (!item) {
        console.log(
          theme.dim(
            arg ? t('improve.not_found', { v: arg }) : t('improve.all_done'),
          ),
        )
        continue
      }
      console.log(
        theme.system(t('improve.start', { id: item.id, title: item.title })),
      )
      const improveBase = mod.createTools(currentWorkdir, {
        undo,
        todos: todoStore,
        readOnly: planMode,
      })
      const improveTools = mergeTools(improveBase, mcpPool?.tools, planMode)
      if (editor) editor.busy = true
      try {
        await mod.runTask(
          runTaskDeps(),
          browser,
          improveTools,
          mod.commands.buildImprovePrompt(item),
          currentWorkdir,
          {
            transcript,
            freshChat: false,
            sendSystemPrompt: false,
            queue: pendingQueue,
            ui: editor || null,
            onChatReady: (chatId) => {
              if (chatId) {
                currentChatId = chatId
                saveLastChat(chatId, currentWorkdir)
              }
            },
            getTokenUsage: () => browser.getLastTokenUsage(),
            selfImprovement: devMode,
          },
        )
      } finally {
        if (editor) editor.busy = false
      }
      // Auto-prune: a finished item keeps its summary line but loses the
      // archived <details> copy of its original text, so BACKLOG.md does not
      // grow on every /improve. Best-effort — a read/write failure must not
      // break the command.
      try {
        const raw = await fs.readFile(
          path.join(currentWorkdir, 'BACKLOG.md'),
          'utf-8',
        )
        const col = mod.collapseBacklog(raw)
        if (col.changed) {
          await fs.writeFile(
            path.join(currentWorkdir, 'BACKLOG.md'),
            col.text,
            'utf-8',
          )
          console.log(
            theme.dim(t('improve.collapsed', { n: String(col.collapsed) })),
          )
        }
      } catch {}
      continue
    }

    if (lower === '/backlog' || lower.startsWith('/backlog ')) {
      // Record an improvement idea without implementing it. `/backlog
      // collapse` prunes the archived blocks instead. The LLM only PLACES
      // the item; the pure helpers in src/backlog.ts own the format.
      const note = trimmed.slice('/backlog'.length).trim()
      const backlogFile = path.join(currentWorkdir, 'BACKLOG.md')
      let backlogText: string
      try {
        backlogText = await fs.readFile(backlogFile, 'utf-8')
      } catch {
        console.error(theme.warn(t('backlog.none')))
        continue
      }
      if (!note) {
        console.log(theme.dim(t('backlog.usage')))
        continue
      }
      if (note === 'collapse') {
        const col = mod.collapseBacklog(backlogText)
        if (!col.changed) {
          console.log(theme.dim(t('backlog.empty')))
        } else {
          await fs.writeFile(backlogFile, col.text, 'utf-8')
          console.log(
            theme.system(t('improve.collapsed', { n: String(col.collapsed) })),
          )
        }
        continue
      }
      // Deterministic append: no model round-trip is needed to record a
      // one-line note, and a pure helper cannot invent a different id than
      // the one the operator is shown.
      const parsed = parseBacklogNote(note)
      const res = mod.appendBacklogItem(backlogText, parsed)
      await fs.writeFile(backlogFile, res.text, 'utf-8')
      console.log(theme.system(t('backlog.adding', { v: res.id })))
      continue
    }

    if (lower === '/review' || lower.startsWith('/review ')) {
      const rest = trimmed.slice('/review'.length).trim()
      const staged = rest.indexOf('--staged') !== -1
      const focus = rest.replace(/--staged/g, '').trim()
      const reviewTask = mod.commands.buildReviewPrompt(focus, staged)
      const reviewTools = mod.createTools(currentWorkdir, {
        undo,
        todos: todoStore,
      })
      if (editor) editor.busy = true
      try {
        await mod.runTask(
          runTaskDeps(),
          browser,
          reviewTools,
          reviewTask,
          currentWorkdir,
          {
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
          },
        )
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
        // undo.ts returns machine codes ('empty'/'disabled') — localize here so
        // an English UI never shows a Russian reason.
        const reasonKey =
          result.reason === 'empty'
            ? 'undo.reason_empty'
            : result.reason === 'disabled'
              ? 'undo.reason_disabled'
              : null
        const reason = reasonKey ? t(reasonKey) : String(result.reason ?? '')
        console.error(theme.error(t('undo.failed', { v: reason })))
      }
      continue
    }

    if (lower === '/undo-list' || lower === '/history') {
      const list = await undo.list(10)
      if (!list.length) {
        console.log(theme.system(t('undo.empty')))
      } else {
        for (const r of list) {
          const stamp = undoDateLabel(r.stamp)
          const flag = r.existed ? t('undo.changed') : t('undo.created')
          console.log(theme.system(`${stamp}  [${flag}]  ${r.originalPath}`))
        }
      }
      continue
    }

    if (lower === '/rewind-list' || lower === '/checkpoints') {
      const list = await checkpoints.list(10)
      if (!list.length) {
        console.log(theme.system(t('rewind.empty')))
      } else {
        console.log(theme.system(t('rewind.list_title')))
        list.forEach((r, i) => {
          const stamp = undoDateLabel(r.stamp)
          const label = r.label ? '  [' + t('rewind.label_backup') + ']' : ''
          console.log(
            theme.system(`  ${i + 1}. ${stamp}  ${r.workdir}${label}`),
          )
        })
      }
      continue
    }

    if (lower === '/rewind' || lower.startsWith('/rewind ')) {
      const selector = trimmed.slice('/rewind'.length).trim() || '1'
      if (editor) editor.lock(t('msg.input_locked'))
      try {
        // The DISPLAY window is the newest 10, but a FULL stamp must resolve
        // against the whole index (restore() searches all of it): an older
        // checkpoint picked by its stamp used to report "/rewind failed", and a
        // stamp sharing its first digits with a newer one could resolve to
        // THAT wrong record.
        const list = await checkpoints.list(10)
        const all = isFullStampSelector(selector)
          ? await checkpoints.list(Number.MAX_SAFE_INTEGER)
          : list
        const target = pickCheckpoint(list, selector, all)
        if (!target) {
          console.error(theme.error(t('rewind.failed', { v: selector })))
          continue
        }
        // Confirmation: a rewind overwrites the working tree, so it must never
        // happen on a muscle-memory Enter.
        const stamp = new Date(target.stamp).toLocaleString()
        let answer = 'n'
        if (process.stdin.isTTY && process.stdout.isTTY) {
          // promptOnce reads stdin itself. While the LineEditor owns the
          // terminal we must hand it over first (the same pause/resume the
          // /config menu uses), or both readers fight for the same keys.
          if (editor) editor.pause()
          try {
            answer = await promptOnce(
              theme.warn(t('rewind.confirm', { v: stamp })) + ' [y/N] ',
            )
          } finally {
            if (editor) editor.resume()
          }
        } else if (trimmed.indexOf('--yes') !== -1) {
          // Non-TTY (piped): do not guess. Require an explicit --yes.
          answer = 'y'
        }
        if (!/^(y|yes|д|да)$/i.test(answer.trim())) {
          console.log(theme.system(t('rewind.cancelled')))
          continue
        }
        const res = await checkpoints.restore(selector)
        if (res.ok && res.record) {
          console.log(
            theme.assistant(
              t('rewind.reverted', { v: String(res.record.stamp) }),
            ),
          )
          if (res.backup) {
            console.log(
              theme.system(t('rewind.backup', { v: String(res.backup.stamp) })),
            )
          }
          transcript.log('rewind', { stamp: res.record.stamp })
        } else {
          const reasonKey =
            res.reason === 'not_found'
              ? 'rewind.reason_not_found'
              : res.reason === 'archive_missing'
                ? 'rewind.reason_archive_missing'
                : res.reason === 'extract_failed'
                  ? 'rewind.reason_extract_failed'
                  : res.reason === 'disabled'
                    ? 'rewind.reason_disabled'
                    : null
          const reason = reasonKey ? t(reasonKey) : String(res.reason ?? '')
          console.error(theme.error(t('rewind.failed', { v: reason })))
        }
      } finally {
        if (editor) editor.unlock()
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

    // A `/goal <condition>` turn is injected directly: skip the slash-command
    // resolution (the text is NOT a command) and use the override as the task.
    const isGoalOverride = taskOverride !== null

    // Custom command or skill invoked as a slash command? Expand it into a
    // task. Skills are instructions the agent follows; custom commands are
    // prompt templates with $ARGUMENTS / {{args}} placeholders.
    let expandedTask: string | null = null
    let missingArgs: string[] | null = null
    let skillAllowedTools: string[] | null = null
    if (lower.startsWith('/') && !isGoalOverride) {
      const name = trimmed.slice(1).split(/\s+/)[0]
      const rest = trimmed.slice(1 + name.length).trim()
      const res = await expandSlashTarget(currentWorkdir, name, rest)
      if (res && 'missing' in res) missingArgs = res.missing
      else if (res) {
        expandedTask = res.text
        if ('allowedTools' in res && res.allowedTools) {
          skillAllowedTools = res.allowedTools
        }
      }
    }

    // A custom command with mandatory `arguments:` refuses to run until the
    // operator supplies them (by position).
    if (missingArgs) {
      console.error(
        theme.error(t('msg.missing_args', { v: missingArgs.join(', ') })),
      )
      continue
    }

    if (lower.startsWith('/') && expandedTask === null && !isGoalOverride) {
      console.error(theme.error(t('msg.unknown_cmd', { v: trimmed })))
      continue
    }

    // ---- Regular task (including in review mode) ----

    const taskText = isGoalOverride
      ? (taskOverride as string)
      : expandedTask !== null
        ? expandedTask
        : trimmed

    // Inline any `@path` references into the task so the agent does not
    // spend a round-trip reading a file the operator already pointed at. Only
    // existing files are inlined; a bare `@name` in prose is left untouched.
    let finalTaskText = taskText
    {
      const refRes = await mod.attach.inlineAtRefs(currentWorkdir, taskText)
      if (refRes.inlined.length) {
        finalTaskText = refRes.text
        console.log(
          theme.system(
            t('msg.at_refs', { n: refRes.inlined.length }) +
              ' ' +
              refRes.inlined.join(', '),
          ),
        )
      }
    }
    lastTaskText = finalTaskText

    // Provider handoff: if the operator switched providers, the new backend
    // has NO chat history. Post the carried-over summary as a preface so the
    // model continues instead of starting cold. Consumed once.
    {
      const handoff = readProviderHandoff(config.provider, currentWorkdir)
      if (handoff) {
        finalTaskText =
          buildHandoffText({
            from: handoffFromLabel(handoff),
            to: providerLabel(config.provider),
            summary: handoff.summary,
            task: handoff.task,
          }) +
          String.fromCharCode(10, 10) +
          'Now continue with this task:' +
          String.fromCharCode(10) +
          finalTaskText
        clearProviderHandoff()
        console.log(theme.system(t('provider.handoff_used')))
      }
    }

    // Dev mode: pick up fresh logic modules before the task.
    await autoReload()
    // Re-scan skills/custom commands before every task: a SKILL.md or a
    // command .md created during this session would otherwise not appear in
    // the «/» hints until a /reload.
    await refreshDynamicCommands(currentWorkdir)
    if (editor) editor.setCommands(buildSlashCommands())

    transcript.log('user_task', {
      task: finalTaskText,
      workdir: currentWorkdir,
    })

    // Snapshot the working tree BEFORE the task so /rewind can
    // undo the whole task in one step. Best-effort: create() never throws, so
    // a missing tar cannot abort the task it was meant to protect. Skipped
    // while reviewing a snapshot (workdir is a throwaway copy).
    if (!reviewMode) {
      const cp = await checkpoints.create(currentWorkdir)
      if (cp) transcript.log('checkpoint', { stamp: cp.stamp })
    }

    const baseTools = mod.createTools(currentWorkdir, {
      undo,
      todos: todoStore,
      readOnly: planMode,
      // `Task` is only offered when subagents are enabled AND we are not in
      // plan (read-only) mode — a `general` subagent could write otherwise.
      subagents: config.browser.subagents && !planMode,
    })
    let tools = mergeTools(baseTools, mcpPool?.tools, planMode)
    // A skill invoked via /skill with `allowed-tools:` narrows the tool set to
    // that allow-list (Claude Code contract). respond is always kept so the run
    // can still finish.
    if (skillAllowedTools) {
      tools = filterToolsByAllowList(tools, skillAllowedTools)
    }
    if (editor) editor.busy = true
    try {
      await mod.runTask(
        runTaskDeps(),
        browser,
        tools,
        finalTaskText,
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
                  providerLabel: providerLabel(config.provider),
                  currentChatId,
                  workdir: currentWorkdir,
                  locale: currentLocale,
                  task: finalTaskText,
                  transcript,
                  ui: editor,
                  buildSystemPrompt: mod.buildSystemPrompt,
                  tools: mod.createTools(currentWorkdir, {
                    undo,
                    todos: todoStore,
                  }),
                  answerTimeoutMs: providerAnswerTimeoutMs(),
                  quiet: true,
                  skipUiLock: true,
                  selfImprovement: devMode,
                })
                if (res.ok) {
                  currentChatId = res.chatId
                  saveLastChat(res.chatId, currentWorkdir)
                }
                return res.ok ? res.chatId : null
              }
            : null,
          onContextLimit: recoverFromContextLimit,
          autoCompactPct: config.browser.autoCompactPct,
          contextLimit: effectiveContextLimit(),
          getTokenUsage: () => browser.getLastTokenUsage(),
          goal: sessionGoal,
          // Completion-goal mode (Claude Code parity): the goal is a CONDITION,
          // judged by a fresh model after each turn; while NOT met the loop
          // keeps working. goalQuery re-reads sessionGoal so a mid-run
          // `/goal clear` stops the auto-continuation immediately.
          goalIsCondition: true,
          goalQuery: () => sessionGoal,
          onGoalCleared: async () => {
            // The evaluator ended the goal (MET or IMPOSSIBLE). Clear the
            // persisted condition so it does not re-arm on the next task; the
            // run-task loop already surfaced the verdict line to the operator.
            sessionGoal = null
            await saveGoal(currentWorkdir, null)
          },
          todosQuery: () => todosSummary(),
          selfImprovement: devMode,
          onSubagent: makeSubagentRunner(),
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
  if (statusLineTimer) clearInterval(statusLineTimer)
  await browser.close().catch(() => {})
  await mod.closeWeb().catch(() => {})
  if (mcpPool) await mcpPool.close().catch(() => {})
  await transcript.close()
  // Surface a transcript that hit backpressure (events buffered in memory, not
  // on disk) instead of leaving it silent.
  const trNote = transcript.healthNote()
  if (trNote) console.log(theme.warn(trNote))
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
