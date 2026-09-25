// Shared contract types for the whole agent.
// Types only here — no runtime code, no side effects.

// ---------- tool-call protocol ----------

/** Tool arguments: an arbitrary JSON object. */
export type ToolArgs = Record<string, unknown>

/** A parsed tool call. */
export interface ToolCall {
  tool: string
  args: ToolArgs
  /** true if the call was recognized by the permissive parser. */
  _permissive?: boolean
}

/** Result of parseToolCall: a single call, an array of calls, or null. */
export type ParsedToolCall = ToolCall | ToolCall[] | null

/** Tool parameters in a description (name -> type string like "string?" ). */
export type ToolParameters = Record<string, string>

/** Tool definition as the agent sees it. */
export interface ToolDef {
  name: string
  description: string
  parameters: ToolParameters
  fn: (args: ToolArgs) => Promise<unknown> | unknown
}

// ---------- config ----------

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

export interface BrowserAuthConfig {
  /** DeepSeek login/phone/email used for automatic sign-in. */
  username: string
  /** DeepSeek password used for automatic sign-in. */
  password: string
  /** Persist the authenticated session (cookies) for later auto-login. */
  saveSession: boolean
}

export interface BrowserConfig {
  answerTimeoutMs: number
  askRetries: number
  stabilityChecks: number
  stabilityDelayMs: number
  minSendIntervalMs: number
  rateLimitWaitMs: number
  maxRateLimitRetries: number
  /** DeepSeek Deep thinking toggle (reasoning; slow, hidden). */
  deepThinking: boolean
  /** DeepSeek Smart search (web search) toggle. */
  webSearch: boolean
  /** Credentials for automatic login when the session is logged out. */
  auth: BrowserAuthConfig
}

import type { Locale } from './i18n.js'

export interface UiConfig {
  /** Language of the interface and the agent's answers. */
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

// ---------- sessions ----------

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

// ---------- transcript ----------

export interface TranscriptLike {
  log: (event: string, data?: Record<string, unknown>) => void
}

// ---------- browser ----------

/** Minimal browser interface needed by agent-loop and self-review. */
export interface BrowserLike {
  ask(
    prompt: string,
    opts?: {
      timeout?: number
      agent?: boolean
      attachments?: Array<{ path: string; name: string; mime: string }>
    },
  ): Promise<string>
  // Optional hook: called right when a message is actually sent (after the
  // send-pause). Lets the UI start the working spinner only on a real send.
  onSendStart?: (() => void) | null
  // Optional hook: called when the agent starts waiting out the send-interval
  // pause, with the remaining seconds. Lets the UI animate the pause status.
  onSendPause?: ((seconds: number) => void) | null
  newChat: () => Promise<void>
  stopGeneration: () => Promise<boolean>
  getCurrentChatId: () => Promise<string | null>
  listChats: (limit?: number) => Promise<Array<{ id: string; title: string }>>
  openChat: (id: string) => Promise<boolean>
  close: () => Promise<void>
}
