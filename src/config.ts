import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ZamesConfig } from './types.js'
import { DEFAULT_DIAGNOSTICS } from './diagnostics.js'
import { DEFAULT_LOCALE } from './i18n.js'
// The /config schema is DATA ONLY and lives in its own module; re-exported
// here so every existing importer keeps working.
export {
  CONFIG_SCHEMA,
  CONFIG_TOP_GROUPS,
  getConfigField,
  fieldsOfTopGroup,
  subgroupsOf,
  topGroupModified,
  type ConfigField,
  type ConfigValueType,
} from './config-schema.js'
import { getConfigField, type ConfigField } from './config-schema.js'
import { writeJsonAtomic } from './fsutil.js'
import { DEFAULT_THEME } from './theme.js'

const ZAMES_HOME = path.join(os.homedir(), '.zames')
const HOME_CONFIG = path.join(ZAMES_HOME, 'config.json')

// The PROJECT config path is resolved LAZILY: `/cd` changes process.cwd() at
// runtime, so freezing it at import time meant a `.zamesrc.json` in the new
// working directory was never read (and writes went to the OLD directory).
export function projectConfigPath(): string {
  return path.join(process.cwd(), '.zamesrc.json')
}

export const DEFAULTS: ZamesConfig = {
  maxIterations: 0,
  // Default backend stays DeepSeek so existing users see no change; the
  // operator switches with /provider qwen (persisted to the home config).
  provider: 'deepseek',
  qwen: {
    model: '',
    enabled: false,
    // Qwen's context window is PER-MODEL, not a site constant: Qwen3-Max is
    // 258K while the 3.7/3.8-Max and Coder builds are 1M. The default assumes
    // the common Qwen3-Max; `/model` re-derives it from the picked id (see
    // qwenContextWindow in src/qwen-ui.ts) and `/config set qwen.contextLimit`
    // overrides it. Kept SEPARATE from ui.contextLimit (DeepSeek's 1M) so one
    // backend's window never becomes the other's denominator.
    contextLimit: 258_048,
    // Qwen DOES rate-limit a rapid burst: measured live, the 5th back-to-back
    // send at 0 ms gap hit "too frequent" and needed a 5-min back-off. A 1 s
    // gap was too small for a real editing session, so the default is now 4 s
    // — enough to stay under the limit while keeping the agent responsive.
    minSendIntervalMs: 4000,
    // The first send after a cold load can take minutes ("Model loading…" +
    // thinking); a GUEST turn measured up to ~9 min live on a cold profile, so
    // give it generous room. A signed-in session answers in seconds; this only
    // bounds the worst case.
    answerTimeoutMs: 900000,
    // Qwen's credentials live HERE, not in browser.auth: sharing one pair
    // meant a DeepSeek login was typed into the Qwen form.
    auth: { username: '', password: '', saveSession: true },
    // Adaptive throttling is a later step for Qwen (its fixed 4 s gap is
    // measured and works); telemetry is still recorded.
    adaptiveThrottle: false,
  },
  glm: {
    model: '',
    // GLM windows are per-model; the default matches GLM-5.3-Flash (128K).
    // `/model` re-derives it from the picked id (glmContextWindow).
    contextLimit: 128_000,
    // The operator's decision: no fixed pause for GLM. The adaptive throttle
    // (on by default) reacts to a REAL rate limit instead.
    minSendIntervalMs: 0,
    answerTimeoutMs: 300000,
    auth: { username: '', password: '', saveSession: true },
    adaptiveThrottle: true,
  },
  // Headless by default: the browser runs without a visible window. Set
  // headless: false (or pass --headed) to watch/debug the page.
  headless: true,
  debug: false,
  // Dev mode (`--dev` / `npm run dev`) turns it on. It MUST have a default:
  // without one `/config reset hotReload` deleted the key and the runtime
  // read `undefined` instead of a real boolean.
  hotReload: false,
  browserChannel: null,

  undo: {
    enabled: true,
    maxBackups: 200,
  },

  // Snapshot the whole working tree at the start of each task so
  // /rewind can roll a risky task back in one step.
  checkpoint: {
    enabled: true,
    maxBackups: 50,
  },

  transcript: {
    enabled: true,
    dir: path.join(os.homedir(), '.zames', 'logs'),
  },

  browser: {
    answerTimeoutMs: 180000,
    askRetries: 3,
    stabilityChecks: 2,
    stabilityDelayMs: 400,
    minSendIntervalMs: 15000,
    thinkingExtraMs: 2000,
    rateLimitWaitMs: 300000,
    maxRateLimitRetries: 6,
    maxIncompleteRetries: 4,
    incompleteWaitMs: 2000,
    autoContinue: true,
    // How long the interactive sign-in window waits for the operator before it
    // gives up (a captcha is solved by hand, so this is generous).
    loginTimeoutMs: 600000,
    continueMinGapMs: 1500,
    // The agent-loop watchdog for ONE ask(). It only bounds a SILENT send:
    // a turn the server already ENDED with no answer (FINISHED + truncated
    // RESPONSE) is detected by the network detectors and retried in seconds,
    // not waited out. 240s used to mean a 4-minute spinner per dead turn.
    askDeadlineMs: 120000,
    maxAfterToolRetries: 6,
    // Auto-compact is ON by default: a provider's context window is small and
    // per-model (GLM: 32k-128k), and running out of it mid-task is a hard stop
    // that loses the work, while a compaction at a safe seam only costs one
    // extra send. The threshold is 85 rather than the old 95 because ONE large
    // tool result can overflow the window before the seam is reached. The loop
    // already guards the dangerous cases: it never compacts mid-generation or
    // during a rate-limit wait, and it disables itself for the rest of the
    // task if the fresh chat did not actually open.
    autoCompact: true,
    autoCompactPct: 85,
    resendPromptOnResume: false,
    // Subagents on by default: the Task tool is what keeps heavy exploration
    // out of the main context, and the main chat is restored afterwards.
    subagents: true,
    maxSubagents: 3,
    deepThinking: false,
    webSearch: true,
    // OFF by default: the telemetry file only serves diagnosis and manual
    // calibration of the send pauses (the adaptive throttle needs the EVENTS,
    // not the file, and keeps working). A regular user gains nothing from it,
    // so it is opted into with `/config set browser.sendTelemetry true`.
    sendTelemetry: false,
    auth: {
      username: '',
      password: '',
      saveSession: true,
    },
  },

  ui: {
    locale: DEFAULT_LOCALE,
    theme: DEFAULT_THEME,
    inputBorder: 'round',
    contextLimit: 1_000_000,
    // 0 = auto: terminal width, capped at 100 columns (the historical width).
    answerWidth: 0,
    // statusLine hook. Off by default; edit config.json to set a command.
    statusLineCommand: '',
    statusLineIntervalMs: 10_000,
    // Use the Ink/React TUI for the input area (the rich editor). Set to false
    // to fall back to the legacy hand-rolled LineEditor.
    tui: true,
    // Render the TUI in the terminal's alternate screen buffer (FULL-SCREEN
    // mode, like Codex / Claude Code / opencode). This is the default because
    // it is the only mode where a resize cannot leave ghost/duplicate lines:
    // the whole screen belongs to the app and the terminal never reflows our
    // output. The trade-off is that the terminal SCROLLBACK is not available
    // (PgUp/PgDn scroll the in-app log instead). Set to false for the inline
    // layout, which keeps the scrollback but is subject to reflow artifacts.
    alternateScreen: true,
    // In-app MOUSE-WHEEL scrolling of the log. ON by default: the operator
    // asked that the wheel scroll the DIALOG (and it must NEVER scroll the
    // input history — history is arrow keys only). That needs terminal mouse
    // REPORTING (1000/1006) plus alternate-scroll OFF (1007l), so the wheel
    // arrives as SGR events we consume and never as Up/Down arrows. The
    // trade-off is that the terminal no longer does its own drag-select, so
    // selecting text needs SHIFT+DRAG (the standard TUI convention: Claude
    // Code / Codex / opencode do the same). Set to false to give the terminal
    // the mouse back (native select, wheel inert).
    mouseScroll: true,
  },

  // Off by default: a full tsc/eslint run after every edit is slow; opt in.
  diagnostics: { ...DEFAULT_DIAGNOSTICS },
}

export function loadConfig(): ZamesConfig {
  const merged = JSON.parse(JSON.stringify(DEFAULTS)) as ZamesConfig
  // Keys the PROJECT file overrides in the HOME file. Kept so the editor can
  // say "your change was saved but the project file still wins" — a live
  // symptom was `/config lang ru` answering "saved", then English after a
  // restart, because a stale project `.zamesrc.json` pinned `ui.locale: en`.
  shadowedKeys = []
  const homeData = readConfigObject(HOME_CONFIG)
  const projectData = readConfigObject(projectConfigPath())
  if (projectData) {
    shadowedKeys = overriddenKeys(homeData, projectData)
  }
  for (const data of [homeData, projectData]) {
    if (!data) continue
    deepMerge(merged as unknown as Record<string, unknown>, data)
  }
  return merged
}

/** Keys the lower-priority file also sets, from the last loadConfig(). */
let shadowedKeys: string[] = []

export function shadowedConfigKeys(): string[] {
  return shadowedKeys.slice()
}

/**
 * Every leaf path ("ui.locale", "browser.auth.username") present in BOTH
 * objects — i.e. a value the PROJECT config overrides over the HOME one.
 * PURE so the precedence puzzle can be tested without touching the disk.
 */
export function overriddenKeys(
  lower: Record<string, unknown> | null,
  higher: Record<string, unknown> | null,
): string[] {
  if (!lower || !higher) return []
  const out: string[] = []
  const walk = (
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    prefix: string,
  ): void => {
    for (const key of Object.keys(b)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue
      }
      const path2 = prefix ? prefix + '.' + key : key
      const av = a[key]
      const bv = b[key]
      if (isPlainObject(av) && isPlainObject(bv)) {
        walk(av, bv, path2)
      } else if (av !== undefined && !isPlainObject(bv)) {
        out.push(path2)
      }
    }
  }
  walk(lower, higher, '')
  return out.sort()
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Parse one config file; null when it is missing or unreadable. */
function readConfigObject(file: string): Record<string, unknown> | null {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return isPlainObject(data) ? data : null
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') {
      console.error(`config: failed to read ${file}: ${err.message}`)
    }
    return null
  }
}

// The agent-loop watchdog deadline per provider. The loop default (240s) is
// tuned for DeepSeek; a Qwen GUEST turn regularly takes 7-8 minutes (cold
// "Model loading…" + a long thinking phase) and would trip the watchdog on
// every send. Derive the deadline from the provider's own answer timeout so
// there is headroom. DeepSeek keeps browser.askDeadlineMs (the loop default).
export function providerAskDeadlineMs(cfg: ZamesConfig): number {
  if (cfg.provider === 'qwen') return cfg.qwen.answerTimeoutMs + 120_000
  if (cfg.provider === 'glm') return cfg.glm.answerTimeoutMs + 120_000
  return cfg.browser.askDeadlineMs
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    // A `.zamesrc.json` (possibly shared/copied from elsewhere) could carry a
    // `__proto__` / `constructor` / `prototype` key; assigning those to a
    // plain object mutates Object.prototype (prototype pollution). Skip them.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue
    }
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      target[key] = (target[key] as Record<string, unknown>) || {}
      deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      )
    } else if (
      source[key] === null &&
      target[key] !== null &&
      typeof target[key] === 'object'
    ) {
      // A `null` SECTION must not wipe the defaults it contains: a hand edit
      // (`"ui": null`) replaced the whole object, so `ui.locale` /
      // `browser.askRetries` came back undefined and the readers broke. Keep
      // the default section; a null for a SCALAR still overrides (the caller
      // validates it).
      continue
    } else {
      target[key] = source[key]
    }
  }
}

export function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  // Two guards, both load-bearing. UNSAFE_PATH_KEYS keeps a dotted path off
  // the PROTOTYPE chain (`__proto__` answered Object.prototype, `constructor`
  // a function, and the /config list rendered `{}` instead of the default
  // marker). The hasOwnProperty check keeps inherited METHODS out: `toString`
  // / `valueOf` are not config values, and only an OWN property counts.
  if (parts.some((p) => UNSAFE_PATH_KEYS.has(p))) return undefined
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined
    }
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

// Object keys that must NEVER be walked/assigned by a dotted path: they reach
// the PROTOTYPE chain. deepMerge() already skips them; setByPath did not, so a
// `__proto__.x` segment polluted Object.prototype for the whole process (and
// wrote the injected keys into the config file).
const UNSAFE_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.')
  if (parts.some((p) => UNSAFE_PATH_KEYS.has(p))) return
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
    cur = cur[p] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
}

function parseConfigValue(field: ConfigField, raw: string): unknown {
  switch (field.type) {
    case 'boolean': {
      const s = raw.trim().toLowerCase()
      if (['true', '1', 'yes', 'y', 'on', 'да', 'вкл'].includes(s)) return true
      if (['false', '0', 'no', 'n', 'off', 'нет', 'выкл'].includes(s))
        return false
      throw new Error('boolean')
    }
    case 'number': {
      // `Number('')` and `Number('   ')` are 0, NOT NaN: an empty value for a
      // field with min 0 passed validation and silently BECAME 0 (an operator
      // clearing the edit buffer turned retries/backups OFF instead of being
      // told the value is invalid).
      if (raw.trim() === '') throw new Error('number')
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new Error('number')
      // Every numeric setting is a COUNT or a MILLISECOND amount, and the code
      // that consumes it compares/loops it as an integer (`attempt <
      // this.askRetries`, `used >= maxSubagents`, a setTimeout delay). A
      // fraction was accepted and then behaved unpredictably: a budget of
      // 0.4 subagents printed "0.4" while refusing nothing on the first run,
      // and 5.7 retries meant "5 attempts plus half an attempt". `5.0` is a
      // legitimate way to type 5, so only a REAL fraction is rejected.
      if (!Number.isInteger(n)) throw new Error('number')
      if (field.min !== undefined && n < field.min) throw new Error('number')
      if (field.max !== undefined && n > field.max) throw new Error('number')
      return n
    }
    case 'enum': {
      const s = raw.trim().toLowerCase()
      if (field.values && !field.values.includes(s)) throw new Error('enum')
      return s
    }
    default:
      return raw
  }
}

export function validateConfigValue(field: ConfigField, raw: string): unknown {
  return parseConfigValue(field, raw)
}

export type ConfigScope = 'project' | 'home'

function configPathFor(scope: ConfigScope): string {
  return scope === 'project' ? projectConfigPath() : HOME_CONFIG
}

/**
 * Read only the specified config file (without merging with defaults), so that
 * writing does not "freeze" all defaults into the user's file.
 */
export function readConfigFile(file: string): Record<string, unknown> {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    // A MISSING file is the normal first-write case. Anything else (EACCES,
    // EISDIR) is reported — the caller must know the write cannot land.
    if (err.code !== 'ENOENT') {
      throw new Error(`failed to read ${file}: ${err.message}`)
    }
    return {}
  }
  try {
    const data = JSON.parse(raw)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
    return {}
  } catch (e) {
    // A file that does not PARSE (a hand edit with a trailing comma, a
    // merge-conflict marker, a bare-word value) is NOT a reason to fail the
    // write: loadConfig() already tolerates it with a warning. Failing here
    // made /config set useless on such a project, and a caller that ignored
    // the error overwrote the WHOLE file with the single edited key.
    //
    // The unparsable text is backed up beside the file first, so the operator's
    // other settings are recoverable by hand; the warning goes to stderr, the
    // same channel loadConfig() uses.
    const backup = file + '.broken-' + Date.now()
    try {
      fs.copyFileSync(file, backup)
      console.error(
        `config: ${file} is not valid JSON (${(e as Error).message});` +
          ` its content was kept in ${backup} and the write starts a fresh file`,
      )
    } catch {
      // Best-effort: an unreadable backup must not block the write either.
    }
    return {}
  }
}

/**
 * Write a setting value to the file. Returns the final object that was
 * written. The value is first validated against the schema.
 */
export function writeConfigValue(
  scope: ConfigScope,
  key: string,
  raw: string,
): { value: unknown; file: string } {
  const field = getConfigField(key)
  if (!field) throw new Error(`unknown setting: ${key}`)
  const value = parseConfigValue(field, raw)
  const file = configPathFor(scope)
  const data = readConfigFile(file)
  setByPath(data, key, value)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeJsonAtomic(file, data)
  return { value, file }
}

/** Reset a setting to the default (remove the key from the file). */
export function resetConfigValue(scope: ConfigScope, key: string): string {
  const field = getConfigField(key)
  if (!field) throw new Error(`unknown setting: ${key}`)
  const file = configPathFor(scope)
  const data = readConfigFile(file)
  const parts = key.split('.')
  let cur: Record<string, unknown> | undefined = data
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!cur || typeof cur[p] !== 'object' || cur[p] === null) {
      cur = undefined
      break
    }
    cur = cur[p] as Record<string, unknown>
  }
  if (cur) delete cur[parts[parts.length - 1]]
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeJsonAtomic(file, data)
  return file
}

// 'PROJECT_CONFIG' stays a getter so existing callers that only DISPLAY the
// path (help, /config) keep working while still reflecting the current cwd.
export const CONFIG_PATHS = {
  HOME_CONFIG,
  get PROJECT_CONFIG(): string {
    return projectConfigPath()
  },
}
export { ZAMES_HOME }
