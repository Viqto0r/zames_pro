import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ZamesConfig } from './types.js'
import { DEFAULT_LOCALE } from './i18n.js'

const ZAMES_HOME = path.join(os.homedir(), '.zames')
const HOME_CONFIG = path.join(ZAMES_HOME, 'config.json')
const PROJECT_CONFIG = path.join(process.cwd(), '.zamesrc.json')

export const DEFAULTS: ZamesConfig = {
  maxIterations: 0,
  // Headless by default: the browser runs without a visible window. Set
  // headless: false (or pass --headed) to watch/debug the DeepSeek page.
  headless: true,
  debug: false,
  browserChannel: null,

  confirmation: {
    write: true,
    edit: true,
    bash: true,
    alwaysConfirm: [
      'rm\s+-rf',
      'rmdir\s+/s',
      'del\s+/[sqf]',
      'format\s+[a-z]:',
      'shutdown',
      'reg\s+delete',
      'remove-item.*-recurse',
      'git\s+push\s+--force',
    ],
  },

  undo: {
    enabled: true,
    maxBackups: 200,
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
    rateLimitWaitMs: 300000,
    maxRateLimitRetries: 6,
    deepThinking: false,
    webSearch: true,
    auth: {
      username: '',
      password: '',
      saveSession: true,
    },
  },

  ui: {
    locale: DEFAULT_LOCALE,
  },
}

export function loadConfig(): ZamesConfig {
  const merged = JSON.parse(JSON.stringify(DEFAULTS)) as ZamesConfig
  for (const file of [HOME_CONFIG, PROJECT_CONFIG]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      deepMerge(merged as unknown as Record<string, unknown>, data)
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') {
        console.error(`config: не удалось прочитать ${file}: ${err.message}`)
      }
    }
  }
  return merged
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
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
    } else {
      target[key] = source[key]
    }
  }
}

// ---------- config editing (/config) ----------
//
// Settings that are allowed to be changed from /config. The list defines both
// the value type (bool/number/string) and the path in the config object. It
// also serves as the "schema" for /config list and for set validation.
//
// To add a new setting — add it here and to DEFAULTS/types.ts.
// Do NOT add paths that change on the fly (transcript.dir, browserChannel)
// here — editing them requires a restart and may surprise. Note:
// browser.auth.* IS in the schema (login/password for auto sign-in); the
// password is masked in the menu/list/get output.

export type ConfigValueType = 'boolean' | 'number' | 'string' | 'enum'

export interface ConfigField {
  /** Path in the config object, e.g. 'confirmation.write'. */
  path: string
  type: ConfigValueType
  /** i18n key of the label (see src/i18n.ts, section cfg.f.*). */
  labelKey: string
  /** i18n key of the group for the menu (cfg.group.*). */
  groupKey: string
  /** Allowed values for enum. */
  values?: string[]
  /** Minimum for number. */
  min?: number
  /** Maximum for number. */
  max?: number
}

export const CONFIG_SCHEMA: ConfigField[] = [
  { path: 'ui.locale', type: 'enum', values: ['ru', 'en'], labelKey: 'cfg.f.ui_locale', groupKey: 'cfg.group.ui' },
 { path: 'maxIterations', type: 'number', min: 0, max: 100000, labelKey: 'cfg.f.maxIterations', groupKey: 'cfg.group.agent' },
  { path: 'headless', type: 'boolean', labelKey: 'cfg.f.headless', groupKey: 'cfg.group.agent' },
  { path: 'browser.auth.username', type: 'string', labelKey: 'cfg.f.browser_authUsername', groupKey: 'cfg.group.browser' },
  { path: 'browser.auth.password', type: 'string', labelKey: 'cfg.f.browser_authPassword', groupKey: 'cfg.group.browser' },
  { path: 'browser.auth.saveSession', type: 'boolean', labelKey: 'cfg.f.browser_authSaveSession', groupKey: 'cfg.group.browser' },
  { path: 'debug', type: 'boolean', labelKey: 'cfg.f.debug', groupKey: 'cfg.group.agent' },
  { path: 'hotReload', type: 'boolean', labelKey: 'cfg.f.hotReload', groupKey: 'cfg.group.agent' },
  { path: 'confirmation.write', type: 'boolean', labelKey: 'cfg.f.confirmation_write', groupKey: 'cfg.group.confirmation' },
  { path: 'confirmation.edit', type: 'boolean', labelKey: 'cfg.f.confirmation_edit', groupKey: 'cfg.group.confirmation' },
  { path: 'confirmation.bash', type: 'boolean', labelKey: 'cfg.f.confirmation_bash', groupKey: 'cfg.group.confirmation' },
  { path: 'undo.enabled', type: 'boolean', labelKey: 'cfg.f.undo_enabled', groupKey: 'cfg.group.undo' },
  { path: 'undo.maxBackups', type: 'number', min: 1, max: 100000, labelKey: 'cfg.f.undo_maxBackups', groupKey: 'cfg.group.undo' },
  { path: 'transcript.enabled', type: 'boolean', labelKey: 'cfg.f.transcript_enabled', groupKey: 'cfg.group.transcript' },
  { path: 'browser.answerTimeoutMs', type: 'number', min: 1000, max: 3600000, labelKey: 'cfg.f.browser_answerTimeoutMs', groupKey: 'cfg.group.browser' },
  { path: 'browser.askRetries', type: 'number', min: 1, max: 100, labelKey: 'cfg.f.browser_askRetries', groupKey: 'cfg.group.browser' },
  { path: 'browser.stabilityChecks', type: 'number', min: 1, max: 100, labelKey: 'cfg.f.browser_stabilityChecks', groupKey: 'cfg.group.browser' },
  { path: 'browser.stabilityDelayMs', type: 'number', min: 0, max: 60000, labelKey: 'cfg.f.browser_stabilityDelayMs', groupKey: 'cfg.group.browser' },
  { path: 'browser.minSendIntervalMs', type: 'number', min: 0, max: 600000, labelKey: 'cfg.f.browser_minSendIntervalMs', groupKey: 'cfg.group.browser' },
  { path: 'browser.rateLimitWaitMs', type: 'number', min: 0, max: 3600000, labelKey: 'cfg.f.browser_rateLimitWaitMs', groupKey: 'cfg.group.browser' },
  { path: 'browser.maxRateLimitRetries', type: 'number', min: 0, max: 100, labelKey: 'cfg.f.browser_maxRateLimitRetries', groupKey: 'cfg.group.browser' },
  { path: 'browser.deepThinking', type: 'boolean', labelKey: 'cfg.f.browser_deepThinking', groupKey: 'cfg.group.browser' },
  { path: 'browser.webSearch', type: 'boolean', labelKey: 'cfg.f.browser_webSearch', groupKey: 'cfg.group.browser' },
]


export function getConfigField(path: string): ConfigField | undefined {
  return CONFIG_SCHEMA.find((f) => f.path === path)
}

export function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined
    }
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
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
      if (['false', '0', 'no', 'n', 'off', 'нет', 'выкл'].includes(s)) return false
      throw new Error('boolean')
    }
    case 'number': {
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new Error('number')
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

export function configPathFor(scope: ConfigScope): string {
  return scope === 'project' ? PROJECT_CONFIG : HOME_CONFIG
}

/**
 * Read only the specified config file (without merging with defaults), so that
 * writing does not "freeze" all defaults into the user's file.
 */
export function readConfigFile(file: string): Record<string, unknown> {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') {
      throw new Error(`не удалось прочитать ${file}: ${err.message}`)
    }
  }
  return {}
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
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8')
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
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  return file
}

export const CONFIG_PATHS = { HOME_CONFIG, PROJECT_CONFIG }
export { ZAMES_HOME }
