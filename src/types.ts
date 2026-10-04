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
export interface ToolContext {
  // Aborted when the operator pressed Esc/Ctrl+C. Long-running tools (Bash)
  // pass it to child_process so the process is actually killed, not merely
  // abandoned.
  signal?: AbortSignal
}

export interface ToolDef {
  name: string
  description: string
  parameters: ToolParameters
  fn: (args: ToolArgs, ctx?: ToolContext) => Promise<unknown> | unknown
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
  /** Extra pause added to minSendIntervalMs when Deep thinking is ON (ms). */
  thinkingExtraMs: number
  rateLimitWaitMs: number
  maxRateLimitRetries: number
  /** Retries for a turn the server truncated (`generation_err`/INCOMPLETE). */
  maxIncompleteRetries: number
  /** Pause before resending after a truncated turn (ms). */
  incompleteWaitMs: number
  /** Auto-click DeepSeek's "Continue" button (reasoning pause). */
  autoContinue: boolean
  /**
   * Min gap between Continue clicks in thinking mode (ms). The `chat/continue`
   * request can hit the rate limit, but the full `minSendIntervalMs` (15s)
   * makes the resume feel sluggish, so a smaller dedicated gap applies to
   * Continue clicks.
   */
  continueMinGapMs: number
  /**
   * Watchdog deadline for ONE browser.ask() (ms). If the model does not come
   * back in time the agent-loop cancels the in-flight ask and retries. Default
   * 240s. This is NOT a send-to-send pause, so tuning it is safe.
   */
  askDeadlineMs: number
  /**
   * How many times a browser.ask() watchdog timeout is retried before the
   * loop gives up (afterToolRetries budget). Default 6.
   */
  maxAfterToolRetries: number
  /**
   * Auto-compact the chat when its context nears the window limit, at the
   * safe seam between tool calls. Off by default (opt-in) because it opens a
   * NEW chat and changes the session mid-run.
   */
  autoCompact: boolean
  /**
   * Fill percentage (of ui.contextLimit) at which auto-compact fires.
   * 50..100, default 95 — leave headroom for the tool-result message, the
   * system prompt and the summary prompt itself.
   */
  autoCompactPct: number
  /** Resend the full system-prompt when a chat is resumed (default off). */
  resendPromptOnResume: boolean
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
  /**
   * The context window size (tokens) used to render the status-bar fill
   * percentage and to color it. DeepSeek's web context is advertised around
   * 1M; the counter itself (accumulated_token_usage) is the truth, this is
   * only the denominator. Configurable so it can be tuned per build.
   */
  contextLimit: number
  /**
   * Maximum width (columns) of a rendered answer. 0 = auto: use the terminal
   * width, capped at 100 (the historical behavior). A wider setting lets a
   * full-width answer use a wide terminal instead of a narrow column.
   */
  answerWidth: number
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
  /**
   * The agent's TodoWrite checklist, restored with the session so a resumed
   * chat keeps its task list. Optional: older session files have no field.
   */
  todos?: Array<{ content: string; status: string }>
  /**
   * Format version of the session file (SESSIONS_FORMAT_VERSION in
   * sessions.ts). Optional: files written before versioning have no field and
   * are treated as version 1.
   */
  version?: number
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
  // Optional hook: a service notice for the operator (rate limit, server busy,
  // resend). While a LineEditor is active a raw console.error is overwritten by
  // its repaint, so these must be routed through the UI.
  onNotice?: ((text: string) => void) | null
  // Optional hook: coarse lifecycle of one send ('generating' | 'paused' |
  // 'settled'), for a status line that shows an explicit phase. Firing it
  // must not change any send timing.
  onSendState?: ((state: 'generating' | 'paused' | 'settled') => void) | null
  // Optional: cancel an in-flight ask() whose caller (the agent-loop
  // watchdog) already gave up on it, and wait for it to settle. Optional so
  // test doubles do not have to implement it.
  cancelPendingAsk?: () => void
  newChat: () => Promise<void>
  stopGeneration: () => Promise<boolean>
  // Set by stopGeneration() (Esc/Ctrl+C). Optional so test doubles do not
  // have to provide them. The agent loop checks them after each tool so a
  // long-running tool can be interrupted without sending its result back.
  _abort?: boolean
  _stopped?: boolean
  getCurrentChatId: () => Promise<string | null>
  listChats: (limit?: number) => Promise<Array<{ id: string; title: string }>>
  openChat: (id: string) => Promise<boolean>
  // Optional: read the whole visible dialogue of the open chat so /resume can
  // print it. Optional so test doubles / self-review do not have to implement
  // it.
  readChatMessages?: () => Promise<
    Array<{ role: 'user' | 'assistant'; text: string }>
  >
  // Optional: fetch the WHOLE dialogue from DeepSeek's history endpoint (used
  // by /resume and the auto-compact local fallback).
  fetchChatMessages?: (
    id: string,
  ) => Promise<Array<{ role: 'user' | 'assistant'; text: string }>>
  // Optional: the latest context size (tokens) DeepSeek reported for the
  // current chat. Used by /cost, /status and auto-compact.
  getLastTokenUsage?: () => number | null
  close: () => Promise<void>
}
