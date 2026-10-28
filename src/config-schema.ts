// The /config SCHEMA: the settings an operator may change from the menu and
// from the /config text subcommands. It is DATA ONLY (no disk, no terminal), so
// the menu, the list renderer and the set/get validation all share it.
//
// TWO LEVELS of grouping. `topKey` is the first menu level (Agent, Browser &
// chat, Providers, Interface, ...) and `groupKey` is the section INSIDE it. The
// flat 40-entry list this replaced was unusable: every timing knob of every
// backend sat in one scroll.
//
// To add a setting — add it here and to DEFAULTS/types.ts.

import { themeNames } from './theme.js'
import { PROVIDER_IDS } from './providers.js'

export type ConfigValueType = 'boolean' | 'number' | 'string' | 'enum'

export interface ConfigField {
  /** Path in the config object, e.g. 'undo.enabled'. */
  path: string
  type: ConfigValueType
  /** i18n key of the label (see src/i18n/config.ts, section cfg.f.*). */
  labelKey: string
  /** i18n key of the TOP-LEVEL menu group (cfg.top.*). */
  topKey: string
  /** i18n key of the SUBGROUP inside the top group (cfg.group.*). */
  groupKey: string
  /** Allowed values for enum. */
  values?: string[]
  /** Minimum for number. */
  min?: number
  /** Maximum for number. */
  max?: number
  /**
   * Hidden from the interactive menu. Reserved for values a hand edit of the
   * config file serves better (none today); they stay settable through
   * `/config set`.
   */
  advanced?: boolean
}

/** Top-level menu groups, in menu order. */
export const CONFIG_TOP_GROUPS = [
  'cfg.top.agent',
  'cfg.top.browser',
  'cfg.top.providers',
  'cfg.top.ui',
  'cfg.top.files',
  'cfg.top.diagnostics',
] as const

export const CONFIG_SCHEMA: ConfigField[] = [
  // ---------- Agent ----------
  {
    path: 'provider',
    type: 'enum',
    values: [...PROVIDER_IDS],
    labelKey: 'cfg.f.provider',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
  },
  {
    path: 'maxIterations',
    type: 'number',
    min: 0,
    max: 100000,
    labelKey: 'cfg.f.maxIterations',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
  },
  {
    path: 'headless',
    type: 'boolean',
    labelKey: 'cfg.f.headless',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
  },
  {
    path: 'debug',
    type: 'boolean',
    labelKey: 'cfg.f.debug',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
  },
  {
    path: 'hotReload',
    type: 'boolean',
    labelKey: 'cfg.f.hotReload',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
  },
  {
    path: 'browser.subagents',
    type: 'boolean',
    labelKey: 'cfg.f.browser_subagents',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
  },
  {
    path: 'browser.maxSubagents',
    type: 'number',
    min: 0,
    max: 20,
    labelKey: 'cfg.f.browser_maxSubagents',
    topKey: 'cfg.top.agent',
    groupKey: 'cfg.group.agent',
  },

  // ---------- Browser & chat: session ----------
  {
    path: 'browser.answerTimeoutMs',
    type: 'number',
    min: 1000,
    max: 3600000,
    labelKey: 'cfg.f.browser_answerTimeoutMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.askRetries',
    type: 'number',
    min: 1,
    max: 100,
    labelKey: 'cfg.f.browser_askRetries',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.stabilityChecks',
    type: 'number',
    min: 1,
    max: 100,
    labelKey: 'cfg.f.browser_stabilityChecks',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.stabilityDelayMs',
    type: 'number',
    min: 0,
    max: 60000,
    labelKey: 'cfg.f.browser_stabilityDelayMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.askDeadlineMs',
    type: 'number',
    min: 30000,
    max: 1800000,
    labelKey: 'cfg.f.browser_askDeadlineMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.maxAfterToolRetries',
    type: 'number',
    min: 0,
    max: 50,
    labelKey: 'cfg.f.browser_maxAfterToolRetries',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.deepThinking',
    type: 'boolean',
    labelKey: 'cfg.f.browser_deepThinking',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.webSearch',
    type: 'boolean',
    labelKey: 'cfg.f.browser_webSearch',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'browser.resendPromptOnResume',
    type: 'boolean',
    labelKey: 'cfg.f.browser_resendPromptOnResume',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },
  {
    path: 'ui.contextLimit',
    type: 'number',
    min: 10_000,
    max: 10_000_000,
    labelKey: 'cfg.f.ui_contextLimit',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.chat',
  },

  // ---------- Browser & chat: throttling ----------
  {
    path: 'browser.minSendIntervalMs',
    type: 'number',
    min: 0,
    max: 600000,
    labelKey: 'cfg.f.browser_minSendIntervalMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.throttle',
  },
  {
    path: 'browser.thinkingExtraMs',
    type: 'number',
    min: 0,
    max: 600000,
    labelKey: 'cfg.f.browser_thinkingExtraMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.throttle',
  },
  {
    path: 'browser.rateLimitWaitMs',
    type: 'number',
    min: 0,
    max: 3600000,
    labelKey: 'cfg.f.browser_rateLimitWaitMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.throttle',
  },
  {
    path: 'browser.maxRateLimitRetries',
    type: 'number',
    min: 0,
    max: 100,
    labelKey: 'cfg.f.browser_maxRateLimitRetries',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.throttle',
  },

  // ---------- Browser & chat: truncated turns ----------
  {
    path: 'browser.maxIncompleteRetries',
    type: 'number',
    min: 0,
    max: 100,
    labelKey: 'cfg.f.browser_maxIncompleteRetries',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.recovery',
  },
  {
    path: 'browser.incompleteWaitMs',
    type: 'number',
    min: 0,
    max: 600000,
    labelKey: 'cfg.f.browser_incompleteWaitMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.recovery',
  },
  {
    path: 'browser.autoContinue',
    type: 'boolean',
    labelKey: 'cfg.f.browser_autoContinue',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.recovery',
  },
  {
    path: 'browser.continueMinGapMs',
    type: 'number',
    min: 0,
    max: 600000,
    labelKey: 'cfg.f.browser_continueMinGapMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.recovery',
  },
  {
    path: 'browser.autoCompact',
    type: 'boolean',
    labelKey: 'cfg.f.browser_autoCompact',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.recovery',
  },
  {
    path: 'browser.autoCompactPct',
    type: 'number',
    min: 50,
    max: 100,
    labelKey: 'cfg.f.browser_autoCompactPct',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.recovery',
  },

  // ---------- Browser & chat: sign-in ----------
  {
    path: 'browser.auth.username',
    type: 'string',
    labelKey: 'cfg.f.browser_authUsername',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.login',
  },
  {
    path: 'browser.auth.password',
    type: 'string',
    labelKey: 'cfg.f.browser_authPassword',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.login',
  },
  {
    path: 'browser.passwordStore',
    type: 'enum',
    values: ['none', 'keychain', 'config'],
    labelKey: 'cfg.f.browser_passwordStore',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.login',
  },
  {
    path: 'browser.auth.saveSession',
    type: 'boolean',
    labelKey: 'cfg.f.browser_authSaveSession',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.login',
  },
  {
    path: 'browser.loginTimeoutMs',
    type: 'number',
    min: 30_000,
    max: 3_600_000,
    labelKey: 'cfg.f.browser_loginTimeoutMs',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.login',
  },

  // ---------- Browser & chat: telemetry ----------
  {
    path: 'browser.sendTelemetry',
    type: 'boolean',
    labelKey: 'cfg.f.browser_sendTelemetry',
    topKey: 'cfg.top.browser',
    groupKey: 'cfg.group.telemetry',
  },

  // ---------- Providers: Qwen ----------
  {
    path: 'qwen.model',
    type: 'string',
    labelKey: 'cfg.f.qwen_model',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.qwen',
  },
  {
    path: 'qwen.contextLimit',
    type: 'number',
    min: 10_000,
    max: 10_000_000,
    labelKey: 'cfg.f.qwen_contextLimit',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.qwen',
  },
  {
    path: 'qwen.minSendIntervalMs',
    type: 'number',
    min: 0,
    max: 600000,
    labelKey: 'cfg.f.qwen_minSendIntervalMs',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.qwen',
  },
  {
    path: 'qwen.answerTimeoutMs',
    type: 'number',
    min: 1000,
    max: 3600000,
    labelKey: 'cfg.f.qwen_answerTimeoutMs',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.qwen',
  },
  {
    path: 'qwen.auth.username',
    type: 'string',
    labelKey: 'cfg.f.qwen_authUsername',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.qwen',
  },
  {
    path: 'qwen.auth.password',
    type: 'string',
    labelKey: 'cfg.f.qwen_authPassword',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.qwen',
  },

  // ---------- Providers: GLM ----------
  {
    path: 'glm.model',
    type: 'string',
    labelKey: 'cfg.f.glm_model',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.glm',
  },
  {
    path: 'glm.contextLimit',
    type: 'number',
    min: 10_000,
    max: 10_000_000,
    labelKey: 'cfg.f.glm_contextLimit',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.glm',
  },
  {
    path: 'glm.minSendIntervalMs',
    type: 'number',
    min: 0,
    max: 600000,
    labelKey: 'cfg.f.glm_minSendIntervalMs',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.glm',
  },
  {
    path: 'glm.answerTimeoutMs',
    type: 'number',
    min: 1000,
    max: 3600000,
    labelKey: 'cfg.f.glm_answerTimeoutMs',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.glm',
  },
  {
    path: 'glm.auth.username',
    type: 'string',
    labelKey: 'cfg.f.glm_authUsername',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.glm',
  },
  {
    path: 'glm.auth.password',
    type: 'string',
    labelKey: 'cfg.f.glm_authPassword',
    topKey: 'cfg.top.providers',
    groupKey: 'cfg.group.glm',
  },

  // ---------- Interface: language & look ----------
  {
    path: 'ui.locale',
    type: 'enum',
    values: ['ru', 'en'],
    labelKey: 'cfg.f.ui_locale',
    topKey: 'cfg.top.ui',
    groupKey: 'cfg.group.look',
  },
  {
    path: 'ui.theme',
    type: 'enum',
    values: themeNames(),
    labelKey: 'cfg.f.ui_theme',
    topKey: 'cfg.top.ui',
    groupKey: 'cfg.group.look',
  },
  {
    path: 'ui.inputBorder',
    type: 'enum',
    values: ['round', 'single', 'double', 'bold', 'none'],
    labelKey: 'cfg.f.ui_inputBorder',
    topKey: 'cfg.top.ui',
    groupKey: 'cfg.group.look',
  },
  {
    path: 'ui.answerWidth',
    type: 'number',
    min: 0,
    max: 1000,
    labelKey: 'cfg.f.ui_answerWidth',
    topKey: 'cfg.top.ui',
    groupKey: 'cfg.group.look',
  },

  // ---------- Interface: terminal TUI ----------
  {
    path: 'ui.tui',
    type: 'boolean',
    labelKey: 'cfg.f.ui_tui',
    topKey: 'cfg.top.ui',
    groupKey: 'cfg.group.tui',
  },
  {
    path: 'ui.alternateScreen',
    type: 'boolean',
    labelKey: 'cfg.f.ui_alternateScreen',
    topKey: 'cfg.top.ui',
    groupKey: 'cfg.group.tui',
  },
  {
    path: 'ui.mouseScroll',
    type: 'boolean',
    labelKey: 'cfg.f.ui_mouseScroll',
    topKey: 'cfg.top.ui',
    groupKey: 'cfg.group.tui',
  },

  // ---------- Files & history ----------
  {
    path: 'undo.enabled',
    type: 'boolean',
    labelKey: 'cfg.f.undo_enabled',
    topKey: 'cfg.top.files',
    groupKey: 'cfg.group.undo',
  },
  {
    path: 'undo.maxBackups',
    type: 'number',
    min: 1,
    max: 100000,
    labelKey: 'cfg.f.undo_maxBackups',
    topKey: 'cfg.top.files',
    groupKey: 'cfg.group.undo',
  },
  {
    path: 'checkpoint.enabled',
    type: 'boolean',
    labelKey: 'cfg.f.checkpoint_enabled',
    topKey: 'cfg.top.files',
    groupKey: 'cfg.group.checkpoint',
  },
  {
    path: 'checkpoint.maxBackups',
    type: 'number',
    min: 1,
    max: 1000,
    labelKey: 'cfg.f.checkpoint_maxBackups',
    topKey: 'cfg.top.files',
    groupKey: 'cfg.group.checkpoint',
  },
  {
    path: 'transcript.enabled',
    type: 'boolean',
    labelKey: 'cfg.f.transcript_enabled',
    topKey: 'cfg.top.files',
    groupKey: 'cfg.group.transcript',
  },

  // ---------- Diagnostics (post-edit check) ----------
  {
    path: 'diagnostics.enabled',
    type: 'boolean',
    labelKey: 'cfg.f.diagnostics_enabled',
    topKey: 'cfg.top.diagnostics',
    groupKey: 'cfg.group.diagnostics',
  },
  {
    path: 'diagnostics.command',
    type: 'string',
    labelKey: 'cfg.f.diagnostics_command',
    topKey: 'cfg.top.diagnostics',
    groupKey: 'cfg.group.diagnostics',
  },
  {
    path: 'diagnostics.timeoutMs',
    type: 'number',
    min: 1000,
    max: 1800000,
    labelKey: 'cfg.f.diagnostics_timeoutMs',
    topKey: 'cfg.top.diagnostics',
    groupKey: 'cfg.group.diagnostics',
  },
  {
    path: 'diagnostics.maxChars',
    type: 'number',
    min: 200,
    max: 100000,
    labelKey: 'cfg.f.diagnostics_maxChars',
    topKey: 'cfg.top.diagnostics',
    groupKey: 'cfg.group.diagnostics',
  },
]

export function getConfigField(path: string): ConfigField | undefined {
  return CONFIG_SCHEMA.find((f) => f.path === path)
}

/** Fields of one top-level menu group, in schema order. */
export function fieldsOfTopGroup(topKey: string): ConfigField[] {
  return CONFIG_SCHEMA.filter((f) => f.topKey === topKey && !f.advanced)
}

/** Subgroups of one top-level group, in schema order (deduplicated). */
export function subgroupsOf(topKey: string): string[] {
  const out: string[] = []
  for (const f of CONFIG_SCHEMA) {
    if (f.topKey !== topKey || f.advanced) continue
    if (!out.includes(f.groupKey)) out.push(f.groupKey)
  }
  return out
}

/**
 * True when at least one field of `topKey` differs from its default — the
 * menu marks such a group so the operator sees where a change lives without
 * opening every group.
 */
export function topGroupModified(
  topKey: string,
  get: (path: string) => unknown,
  getDefault: (path: string) => unknown,
): boolean {
  return fieldsOfTopGroup(topKey).some((f) => {
    const cur = get(f.path)
    const def = getDefault(f.path)
    if (cur === undefined) return false
    try {
      return JSON.stringify(cur) !== JSON.stringify(def)
    } catch {
      return String(cur) !== String(def)
    }
  })
}
