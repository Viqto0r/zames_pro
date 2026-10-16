// The UI EDITOR interface — the shared surface of the legacy `LineEditor`
// (src/input.ts) and the new Ink-based `TuiEditor` (src/tui/TuiEditor.tsx).
//
// index.ts and run-task.ts talk to the UI ONLY through this interface, so the
// rendering engine (hand-rolled ANSI vs React/Ink) can be swapped without
// touching the agent code. Both classes implement every member below.
//
// Only the members the agent actually uses are listed; the concrete classes may
// expose more (internal render helpers, etc.).

import type { Attachment } from '../attachments.js'
import type { Locale } from '../i18n.js'
import type { SlashCommand } from '../input/layout.js'

/** A store of attachments staged for the current message. */
export interface AttachmentStoreLike {
  items: Attachment[]
  add(item: {
    path: string
    name: string
    mime: string
    size: number
    hash?: string
  }): Attachment
  reset(): void
}

export interface UiEditor {
  // ---- state fields the agent reads/writes directly ----
  busy: boolean
  locked: boolean
  history: string[]
  contextLimit: number
  rendered: boolean
  attachments: AttachmentStoreLike

  // ---- operator callbacks the agent wires up ----
  onSubmit: ((text: string, attachments: Attachment[]) => void) | null
  onEscape: (() => void) | null
  onCtrlC: (() => void) | null
  onHistoryChange: ((history: string[]) => void) | null
  onAttach:
    ((raw: string) => Attachment | null | Promise<Attachment | null>) | null
  onClipboard: (() => Promise<Attachment | null>) | null
  onQueueQuery: (() => number) | null
  onTasksQuery: (() => string) | null
  onContextQuery: (() => number | null) | null
  onToggleQuery:
    (() => { deepThinking: boolean; webSearch: boolean } | null) | null

  // ---- lifecycle ----
  start(): boolean
  dispose(): void
  pause(): void
  resume(): void

  // ---- status / log ----
  printAbove(text: unknown): void
  setStatus(text: string): void
  setSendState(state: string): void
  setPrompt(str: string): void
  setProvider(text: string): void
  /** Header info for full-screen mode (title/version/workdir). */
  setHeader?(info: {
    title?: string
    version?: string
    workdir?: string
    mouseScroll?: boolean
  }): void
  setStatusLine(text: string): void
  setContextStatus(tokens: number | null | undefined): void
  setContextLimit(limit: number): void
  setLocale(locale: Locale): void
  setCommands(commands: SlashCommand[]): void
  setTmpDir(dir: string): void
  clear(): void
  refreshStatus(): void
  clearScreen(): void
  lock(status?: string): void
  unlock(): void

  // ---- spinner-compatible surface ----
  thinking(): void
  sendPause(seconds: number): void
  setPending(text: string | null): void
  stop(): void
  toolCall(name: string, args: unknown): void
  toolResult(result: unknown): void
  assistant(msg: string): void
  warning(msg: string): void
  succeed(): void
  fail(): void
}
