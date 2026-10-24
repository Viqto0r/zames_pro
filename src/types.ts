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

export interface UndoConfig {
  enabled: boolean
  maxBackups: number
}

export interface CheckpointConfig {
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
   * How long the interactive sign-in window waits for the operator before it
   * gives up (ms). A captcha is solved by hand, so this is generous.
   */
  loginTimeoutMs: number
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
  /**
   * Offer the `Task` tool to the model: delegate a self-contained sub-task to
   * a SUBAGENT in its own chat with an isolated context. On by default: it
   * protects the main chat's context. The main chat is restored afterwards;
   * it costs extra sends, so a tight budget (maxSubagents) guards against
   * a model that delegates in a loop.
   */
  subagents: boolean
  /**
   * How many subagent runs ONE task may spawn before `Task` starts answering
   * "budget exhausted". Guards against a model that delegates in a loop.
   */
  maxSubagents: number
  /** DeepSeek Deep thinking toggle (reasoning; slow, hidden). */
  deepThinking: boolean
  /** DeepSeek Smart search (web search) toggle. */
  webSearch: boolean
  /**
   * Write one JSONL line per send to ~/.zames/logs/sends-<provider>.jsonl
   * (timing, mode flags, the outcome and the server error; never the prompt
   * or the answer). On by default; turn it off to keep the logs quiet.
   */
  sendTelemetry: boolean
  /** Credentials for automatic login when the session is logged out. */
  auth: BrowserAuthConfig
}

import type { Locale } from './i18n.js'
import type { UiHealthResult } from './ui-health.js'
import type { ProviderId } from './providers.js'

// Qwen Chat (chat.qwen.ai) provider settings. The shared timings (timeouts,
// throttle, retries) live in `browser`; only Qwen-only knobs are here.
// Per-provider credentials. DeepSeek keeps `browser.auth` (so an old config
// keeps working); every other backend owns its own section, because a shared
// pair meant a DeepSeek login was typed into the Qwen form.
export interface ProviderAuthConfig {
  username: string
  password: string
  saveSession: boolean
}

// GLM (chat.z.ai) provider settings. Same shape as Qwen's: the shared timings
// live in `browser`, only GLM's own knobs are here.
export interface GlmConfig {
  /** Model id sent with each completion (from GET /api/models). */
  model: string
  /** GLM context window (tokens); windows are PER-MODEL. */
  contextLimit: number
  /** Minimum pause between agent sends (ms); 0 for GLM by decision. */
  minSendIntervalMs: number
  /** Answer timeout (ms): a thinking turn on a large prompt is slow. */
  answerTimeoutMs: number
  /** Saved GLM credentials (separate from the other providers'). */
  auth: ProviderAuthConfig
  /** Adaptive send throttle (on by default for GLM). */
  adaptiveThrottle: boolean
}

export interface QwenConfig {
  /** Model id sent with each completion (from GET /api/v2/models/). */
  model: string
  /** Open the Qwen provider (mirrors the top-level `provider` switch). */
  enabled: boolean
  /**
   * The Qwen context window (tokens) used for the status-bar fill percentage
   * and the auto-compact threshold. Qwen windows are PER-MODEL (258K for
   * Qwen3-Max, 1M for the 3.7/3.8-Max and Coder builds), so this is separate
   * from `ui.contextLimit` (DeepSeek's 1M). `/model` sets it automatically
   * from the picked model; set it by hand to override.
   */
  contextLimit: number
  /**
   * Minimum pause between agent sends (ms). Qwen does NOT rate-limit the way
   * DeepSeek does — a live experiment (4 back-to-back sends, 0 ms gap) hit no
   * limit — so the 15 s DeepSeek default is unnecessary latency here. A small
   * gap is kept as a courtesy. Set to 0 to disable entirely.
   */
  minSendIntervalMs: number
  /** Qwen answer timeout (ms). The first send after a cold load is slow
   *  ("Model loading…" + thinking), so it gets more room than DeepSeek. */
  answerTimeoutMs: number
  /** Saved Qwen credentials (separate from DeepSeek's `browser.auth`). */
  auth: ProviderAuthConfig
  /**
   * Adaptive send throttle: derive the pause from the observed rate limits
   * instead of a fixed interval. Off for Qwen (its fixed 4 s gap works); the
   * telemetry is still recorded so a value can be tuned later.
   */
  adaptiveThrottle: boolean
}

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
  /**
   * Optional status-line command. When set, zames runs it periodically
   * (and after each task) with a JSON status on stdin and shows the first line
   * of its stdout in the status line, like Claude Code's statusLine hook.
   * Empty = off. Kept OUT of CONFIG_SCHEMA (a shell command does not belong in
   * the interactive menu); edit it in config.json directly.
   */
  statusLineCommand: string
  /** How often (ms) the statusLine command is re-run. Default 10000. */
  statusLineIntervalMs: number
  /**
   * Use the Ink/React TUI for the input area. When false the legacy
   * hand-rolled LineEditor is used instead. Default true.
   */
  tui: boolean
  /**
   * Render the TUI in the terminal's alternate screen buffer (full-screen
   * mode like vim/htop). Off by default so the scrollback stays available.
   */
  alternateScreen: boolean
  /**
   * In-app mouse-wheel scrolling of the log. Off by default because it enables
   * terminal mouse reporting, which STEALS drag-selection (the operator can no
   * longer select text with the mouse). Set true to scroll the log with the
   * wheel; then use Shift+drag to select text.
   */
  mouseScroll: boolean
}

export interface ZamesConfig {
  maxIterations: number
  /** Active chat backend. See src/providers.ts for the registry. */
  provider: ProviderId
  /** Qwen-specific settings (the shared timings live in `browser`). */
  qwen: QwenConfig
  /** GLM-specific settings (the shared timings live in `browser`). */
  glm: GlmConfig
  headless: boolean
  debug: boolean
  browserChannel: string | null
  hotReload?: boolean
  undo: UndoConfig
  checkpoint: CheckpointConfig
  transcript: TranscriptConfig
  browser: BrowserConfig
  ui: UiConfig
  diagnostics: DiagnosticsConfig
}

// Post-edit diagnostics: a check command run after a file-mutating tool.
export interface DiagnosticsConfig {
  enabled: boolean
  command: string
  timeoutMs: number
  tools: string[]
  maxChars: number
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
  /**
   * The chat backend that owns `id` ('deepseek' | 'qwen'). A chat id is only
   * meaningful to ITS provider, so a resume must open it in the right one (or
   * warn). Optional: files written before the second provider have no field
   * and default to deepseek.
   */
  provider?: ProviderId
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
  /**
   * Name of the chat backend ('deepseek' | 'qwen'). Used only to pick the
   * label in provider-agnostic operator notices (the agent loop must not say
   * "DeepSeek" while driving Qwen). Optional so test doubles need not set it.
   */
  providerName?: string
  newChat: () => Promise<void>
  stopGeneration: () => Promise<boolean>
  // Set by stopGeneration() (Esc/Ctrl+C). Optional so test doubles do not
  // have to provide them. The agent loop checks them after each tool so a
  // long-running tool can be interrupted without sending its result back.
  _abort?: boolean
  _stopped?: boolean
  getCurrentChatId: () => Promise<string | null>
  listChats: (limit?: number) => Promise<ChatInfo[]>
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
  // Optional: the latest context size (tokens) the provider reported for the
  // current chat. Used by /cost, /status and auto-compact.
  getLastTokenUsage?: () => number | null
  close: () => Promise<void>
}

// ---------- chat provider ----------

/** A chat entry in the provider's sidebar. */
export interface ChatInfo {
  id: string
  title: string
  href?: string
}

/** One message of a restored dialogue (role + text). */
export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

// A chat backend the agent can drive. DeepSeekBrowser is the reference
// implementation; QwenBrowser is the second one. The agent loop only needs
// BrowserLike; the full surface below (chat management, login, health probe,
// diagnostics) is what index.ts / run-task.ts / compact.ts reach for. Keeping
// the concrete type behind this interface is what lets the operator switch
// providers without touching the loop.
export interface ChatProvider extends BrowserLike {
  // Chat management.
  newChat: () => Promise<void>
  stopGeneration: () => Promise<boolean>
  getCurrentChatId: () => Promise<string | null>
  listChats: (limit?: number) => Promise<ChatInfo[]>
  openChat: (id: string) => Promise<boolean>
  // Required history/usage access (both providers implement them, even though
  // BrowserLike declares them optional for test doubles).
  readChatMessages: () => Promise<ChatMessage[]>
  fetchChatMessages: (id: string) => Promise<ChatMessage[]>
  getLastTokenUsage: () => number | null
  // Lifecycle.
  launch: () => Promise<void>
  waitForLogin: () => Promise<void>
  close: () => Promise<void>
  // Diagnostics / UI.
  probeUiHealth: () => Promise<UiHealthResult>
  dumpDom: (file: string) => Promise<{ file: string; selectors: unknown }>
  setLocale: (locale: Locale) => void
  getToggleStatesSync: () => { deepThinking: boolean; webSearch: boolean }
  setToggleState: (s: { deepThinking?: boolean; webSearch?: boolean }) => void
  sendIntervalMs: () => number
  // Flags the agent loop checks after each tool. `_abort` is reset per send,
  // `_stopped` lives for the whole batch.
  _abort: boolean
  _stopped: boolean
  // Provider name shown to the operator ('deepseek' | 'qwen').
  providerName: string
  // Paths used by the restored-dialogue debug line.
  _apiAuth: string
  _lastHistoryError: string
}
