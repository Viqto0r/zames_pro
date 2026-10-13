// The TUI STATE STORE — the bridge between the imperative agent code and the
// React/Ink render tree.
//
// Why a store instead of React state:
//   * the agent loop calls the UI from OUTSIDE React (`printAbove`, `toolCall`,
//     `thinking`, ...), i.e. imperatively;
//   * Ink re-renders from React state, which can only be set from inside a
//     component or via a setter we own.
// So the imperative API writes into this store and the Ink tree subscribes
// via `useSyncExternalStore`. One direction (calls -> store -> render) means no
// conflict between the two worlds.
//
// The store keeps the WHOLE app state in one immutable snapshot object so
// `useSyncExternalStore` gets a stable reference between changes (a new object
// is produced only on an actual mutation).

import type { Attachment } from '../attachments.js'
import type { SlashCommand } from '../input/layout.js'
import type { Locale } from '../i18n.js'
import { initialEditState, type EditState } from './edit.js'

export type LogKind =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'toolResult'
  | 'warning'
  | 'system'
  | 'summary'
  | 'info'

/** One permanently-rendered entry in the scrollback log (an Ink `<Static>`
 *  item). `raw` marks pre-rendered ANSI text (markdown answers) that must not
 *  be re-styled by Ink. */
export interface LogEntry {
  id: number
  kind: LogKind
  text: string
  /** Pre-rendered ANSI (e.g. a markdown answer) — print verbatim. */
  raw?: boolean
}

/** Lifecycle phase of the current send, mirrored from the browser. */
export type SendState = '' | 'generating' | 'paused' | 'settled'

/** Everything the bottom panel (status + input + suggestions) reads. */
export interface TuiState {
  /** The conversation log (grows forever). In INLINE mode Ink prints it as
   *  <Static> scrollback; in FULL-SCREEN mode it is a scrollable viewport. */
  log: LogEntry[]
  /** Header info shown in full-screen mode (top bar). */
  title: string
  version: string
  workdir: string
  /** Scroll position of the log viewport in FULL-SCREEN mode: how many lines
   *  from the bottom are hidden (0 = pinned to the newest). */
  scroll: number
  /** True while a task is in flight (Esc/Ctrl+C abort the generation). */
  busy: boolean
  /** True while a long operation locks the input (chat resume, /new, ...). */
  locked: boolean
  /** Lock/status hint shown while `locked` or idle. */
  statusText: string
  /** Lifecycle prefix for the status line. */
  sendState: SendState
  /** Animated base text for the spinner ('' hides the spinner). */
  animBase: string
  /** Epoch ms when the current animated phase started (for the elapsed
   *  label). 0 when not animating. */
  animStart: number
  /** Typed-but-not-yet-sent text, shown instead of the spinner. */
  pendingText: string | null
  /**
   * The FULL editor state (buffer, cursor, history, search, pastes, undo).
   * It lives in the STORE, not in a component's useState, so an Ink remount
   * (a terminal resize, a pause/resume) preserves what the operator typed —
   * a local useState would reset the line on every remount.
   */
  edit: EditState
  /** Collapsed paste blocks (marker <-> original text). */
  pastes: Array<{ marker: string; text: string }>
  /** Attachments staged for the current message. */
  attachments: Attachment[]
  /** Input history (up/down arrows, Ctrl+R). */
  history: string[]
  /** Prompt string (e.g. "❯ repo › "). */
  prompt: string
  /** Slash-command list for the suggestion popup. */
  commands: SlashCommand[]
  /** Locale for all editor labels. */
  locale: Locale
  /** Right-aligned context text ("ctx: 12k · 34%") or null. */
  contextText: string | null
  /** Context fill level for coloring: ok/warn/high. */
  contextLevel: 'ok' | 'warn' | 'high' | null
  /** Number of queued messages (badge ⧗N). */
  queueLength: number
  /** Task-list summary ("tasks: 2/5"), empty hides it. */
  tasks: string
  /** Provider badge ("Qwen"/"DeepSeek"), empty hides it. */
  provider: string
  /** In-app mouse-wheel scrolling (needs terminal mouse reporting). */
  mouseScroll: boolean
  /** Deep-thinking toggle on. */
  thinkingEnabled: boolean
  /** Web-search toggle on. */
  searchEnabled: boolean
  /** statusLine hook text, empty hides it. */
  statusLine: string
  /** Terminal columns (resize-aware). */
  columns: number
}

function initialState(): TuiState {
  return {
    log: [],
    title: 'zames',
    version: '',
    workdir: '',
    scroll: 0,
    busy: false,
    locked: false,
    statusText: '',
    sendState: '',
    animBase: '',
    animStart: 0,
    pendingText: null,
    edit: initialEditState(),
    pastes: [],
    attachments: [],
    history: [],
    prompt: '> ',
    commands: [],
    locale: 'ru',
    contextText: null,
    contextLevel: null,
    queueLength: 0,
    tasks: '',
    provider: '',
    mouseScroll: false,
    thinkingEnabled: false,
    searchEnabled: false,
    statusLine: '',
    columns: process.stdout.columns || 80,
  }
}

/**
 * A minimal external store for the Ink tree.
 *
 * Mutations go through `set(partial)` which shallow-merges into a NEW snapshot
 * object, so `useSyncExternalStore` sees a changed reference and re-renders.
 * A render that changes nothing produces no new object and no repaint.
 */
export class TuiStore {
  private state: TuiState = initialState()
  private listeners = new Set<() => void>()
  private nextLogId = 1

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = (): TuiState => this.state

  /** Shallow-merge a partial update and notify subscribers. */
  set(partial: Partial<TuiState>): void {
    let changed = false
    for (const k of Object.keys(partial) as Array<keyof TuiState>) {
      if (partial[k] !== this.state[k]) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.state = { ...this.state, ...partial }
    this.emit()
  }

  /** Functional update over the whole snapshot. */
  update(fn: (s: TuiState) => Partial<TuiState>): void {
    this.set(fn(this.state))
  }

  /** Append one permanent log entry (an Ink `<Static>` item). */
  pushLog(kind: LogKind, text: string, raw = false): void {
    const entry: LogEntry = { id: this.nextLogId++, kind, text, raw }
    this.state = { ...this.state, log: [...this.state.log, entry] }
    this.emit()
  }

  /** Append several entries in one notification (cheaper than N pushes). */
  pushLogs(entries: Array<Omit<LogEntry, 'id'>>): void {
    if (!entries.length) return
    const withIds = entries.map((e) => ({ ...e, id: this.nextLogId++ }))
    this.state = { ...this.state, log: [...this.state.log, ...withIds] }
    this.emit()
  }

  private emit(): void {
    for (const cb of this.listeners) cb()
  }
}
