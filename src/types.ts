// Общие типы-контракты для всего агента.
// Здесь только типы — ни рантайм-кода, ни побочных эффектов.

// ---------- tool-call протокол ----------

/** Аргументы инструмента: произвольный JSON-объект. */
export type ToolArgs = Record<string, unknown>

/** Разобранный вызов инструмента. */
export interface ToolCall {
  tool: string
  args: ToolArgs
  /** true, если вызов распознан нестрогим (permissive) парсером. */
  _permissive?: boolean
}

/** Результат parseToolCall: один вызов, массив вызовов или null. */
export type ParsedToolCall = ToolCall | ToolCall[] | null

/** Параметры инструмента в описании (имя -> тип-строка вроде "string?" ). */
export type ToolParameters = Record<string, string>

/** Определение инструмента, как его видит агент. */
export interface ToolDef {
  name: string
  description: string
  parameters: ToolParameters
  fn: (args: ToolArgs) => Promise<unknown> | unknown
}

// ---------- конфиг ----------

export interface ConfirmationConfig {
  write: boolean
  edit: boolean
  bash: boolean
  alwaysConfirm: string[]
}

export interface UndoConfig {
  enabled: boolean
  maxBackups: number
}

export interface TranscriptConfig {
  enabled: boolean
  dir: string
}

export interface BrowserConfig {
  answerTimeoutMs: number
  askRetries: number
  stabilityChecks: number
  stabilityDelayMs: number
  minSendIntervalMs: number
  rateLimitWaitMs: number
  maxRateLimitRetries: number
}

import type { Locale } from './i18n.js'

export interface UiConfig {
  /** Язык интерфейса и ответов агента. */
  locale: Locale
}

export interface ZamesConfig {
  maxIterations: number
  headless: boolean
  debug: boolean
  browserChannel: string | null
  hotReload?: boolean
  confirmation: ConfirmationConfig
  undo: UndoConfig
  transcript: TranscriptConfig
  browser: BrowserConfig
  ui: UiConfig
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

// ---------- git ----------

export interface GitContext {
  branch: string
  changedFiles: number
  statusPreview: string
  hasOrigin: boolean
  ahead: number
  behind: number
}

// ---------- сессии ----------

export interface Session {
  id: string
  title: string
  workdir: string
  createdAt: string
  updatedAt: string
}

export interface SessionsIndex {
  last: string | null
  byWorkdir: Record<string, string>
}

// ---------- транскрипт ----------

export interface TranscriptLike {
  log: (event: string, data?: Record<string, unknown>) => void
}

// ---------- браузер ----------

/** Минимальный интерфейс браузера, который нужен agent-loop и self-review. */
export interface BrowserLike {
  ask(
    prompt: string,
    opts?: { timeout?: number; agent?: boolean },
  ): Promise<string>
  newChat: () => Promise<void>
  stopGeneration: () => Promise<boolean>
  getCurrentChatId: () => Promise<string | null>
  listChats: (limit?: number) => Promise<Array<{ id: string; title: string }>>
  openChat: (id: string) => Promise<boolean>
  close: () => Promise<void>
}
