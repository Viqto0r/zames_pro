// TuiEditor — a drop-in replacement for the hand-rolled LineEditor backed by an
// Ink/React render tree.
//
// WHY an adapter and not a rewrite of index.ts:
//   * index.ts (4200 lines) and run-task.ts call the UI through a large but
//     STABLE imperative surface (`printAbove`, `lock`, `toolCall`, `busy`, ...);
//   * Ink renders from React state, which can only be driven from inside the
//     tree. The adapter is the seam: it implements the SAME surface and forwards
//     every call into the TuiStore, which the tree subscribes to.
// So the rest of the agent is unchanged; only the rendering engine differs.
//
// Lifecycle: `start()` mounts the Ink app; `dispose()` unmounts it. A `pause()`
// /`resume()` pair suspends the tree for a foreign full-screen UI (the config
// menu) — implemented as unmount/remount so the foreign program owns the
// terminal cleanly.

import fs from 'node:fs'
import React from 'react'
import { render, type Instance } from 'ink'
import { TuiStore, type LogKind, type SendState } from './store.js'
import { TuiApp } from './TuiApp.js'
import { FullScreenApp } from './FullScreenApp.js'
import { AttachmentStore, type Attachment } from '../attachments.js'
import { translate, type Locale } from '../i18n.js'
import {
  expandPastes,
  formatTokenStatus,
  tokenStatusLevel,
  wrapToWidth,
  truncateToWidth,
  type SlashCommand,
} from '../input/layout.js'
import { contentWidth } from '../width.js'
import { theme } from '../theme.js'
import { renderMarkdown } from '../markdown.js'
import { summarizeToolCall, looksLikeToolError } from '../tool-summary.js'
import { randomThinkingPhrase, stripEllipsis } from '../spinner.js'

/** The editor options, matching the LineEditor constructor. */
export interface TuiEditorOptions {
  prompt?: string
  commands?: SlashCommand[]
  locale?: Locale
  /** Render in the alternate screen buffer (full-screen). */
  alternateScreen?: boolean
}

export class TuiEditor {
  readonly store = new TuiStore()
  readonly attachments = new AttachmentStore()

  // ---- imperative surface used by index.ts / run-task.ts ----
  onSubmit: ((text: string, attachments: Attachment[]) => void) | null = null
  onEscape: (() => void) | null = null
  onCtrlC: (() => void) | null = null
  onHistoryChange: ((history: string[]) => void) | null = null
  onAttach:
    ((raw: string) => Attachment | null | Promise<Attachment | null>) | null =
    null
  onClipboard: (() => Promise<Attachment | null>) | null = null
  onQueueQuery: (() => number) | null = null
  onTasksQuery: (() => string) | null = null
  onContextQuery: (() => number | null) | null = null
  onToggleQuery:
    (() => { deepThinking: boolean; webSearch: boolean } | null) | null = null

  busy = false
  locked = false
  history: string[] = []
  contextLimit = 1_000_000
  /** Marker that the editor is started (kept for API compatibility). */
  rendered = false
  /** Marks this editor as the Ink TUI (used to pick the Ink confirm modal). */
  readonly isTui = true

  private instance: Instance | null = null
  private prompt: string
  private commands: SlashCommand[]
  private locale: Locale
  private contextTokens: number | null = null
  private statusText = ''
  private pendingText: string | null = null
  private tmpDir = ''
  private badgeTimer: ReturnType<typeof setInterval> | null = null
  private alternateScreen: boolean
  /**
   * How many log entries have already been painted to the terminal. Used as
   * the <Static> watermark across a pause/resume remount, so the scrollback is
   * not reprinted. Reset by clearScreen (the screen is wiped).
   */
  private printedCount = 0
  /** SIGWINCH handler installed while the app is mounted. */
  private onResize: (() => void) | null = null
  private resizeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: TuiEditorOptions = {}) {
    this.prompt = opts.prompt ?? '> '
    this.commands = opts.commands ?? []
    this.locale = opts.locale ?? 'ru'
    this.alternateScreen = !!opts.alternateScreen
    this.store.set({
      prompt: this.prompt,
      commands: this.commands,
      locale: this.locale,
      history: this.history,
    })
  }

  // ---------- lifecycle ----------

  start(): boolean {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) return false
    if (this.instance) return true
    this.mount()
    return true
  }

  private buildInputProps(): Parameters<typeof TuiApp>[0]['inputProps'] {
    return {
      onSubmit: (text, atts) => this.handleSubmit(text, atts),
      onEscape: () => this.onEscape?.(),
      onCtrlC: () => this.onCtrlC?.(),
      onAttach: (raw) => this.onAttach?.(raw) ?? null,
      onClipboard: () => this.onClipboard?.() ?? Promise.resolve(null),
      onHistoryChange: (h) => {
        this.history = h
        this.onHistoryChange?.(h)
      },
      onClearScreen: () => this.clearScreen(),
      attachments: this.attachments.items,
      onPastesChange: (pastes) => this.store.set({ pastes }),
    }
  }

  private mount(): void {
    // Seed the editor history from the persisted list IF the store has none
    // yet (first mount). index.ts sets `this.history` from loadHistory()
    // BEFORE start(); the store owns the live buffer so a later remount keeps
    // both the typed line and the history.
    const snap = this.store.getSnapshot()
    if (snap.edit.history.length === 0 && this.history.length > 0) {
      this.store.set({
        edit: {
          ...snap.edit,
          history: this.history.slice(),
          histIndex: this.history.length,
        },
      })
    }
    // growing down from the current cursor row; a fresh terminal starts at the
    // top, so without this the panel would sit in the middle of an empty
    // screen. Filling the viewport with newlines first makes Ink's output land
    // at the bottom, and every later log row scrolls the screen up while the
    // panel stays put — the same technique the legacy LineEditor used
    // (`_padToBottom`).
    this.padToBottom()
    const tree = this.alternateScreen ? (
      <FullScreenApp store={this.store} inputProps={this.buildInputProps()} />
    ) : (
      <TuiApp
        store={this.store}
        inputProps={this.buildInputProps()}
        initialPrintedCount={this.printedCount}
      />
    )
    this.instance = render(tree, {
      exitOnCtrlC: false,
      // The app manages console.log/error itself (index.ts routes them to
      // printAbove), so Ink must not patch them: an unmount (clearScreen)
      // would otherwise restore the native console and lose that routing.
      patchConsole: false,
      alternateScreen: this.alternateScreen,
    })
    this.rendered = true
    // DEV DIAGNOSTIC: dump every raw stdin chunk to a file so a terminal's
    // key encoding (e.g. Ctrl+Delete = ESC d in VSCode) can be captured from
    // the LIVE agent, not guessed. Off unless ZAMES_TUI_KEY_DEBUG names a
    // file.
    const keyDbg = process.env.ZAMES_TUI_KEY_DEBUG
    if (keyDbg) {
      process.stdin.on('data', (d: Buffer) => {
        try {
          fs.appendFileSync(
            keyDbg,
            new Date().toISOString() +
              ' ' +
              d.toString('hex') +
              ' ' +
              JSON.stringify(d.toString('utf-8')) +
              String.fromCharCode(10),
          )
        } catch {
          /* ignore */
        }
      })
    }
    this.installResizeHandler()
    // Entries shown so far are now on screen; a later remount must not reprint
    // them.
    this.printedCount = this.store.getSnapshot().log.length
    // Badges (queue/tasks/toggles/context) are pulled on a light timer so they
    // stay live without the caller polling — mirroring the old editor, whose
    // status render read them on every repaint.
    if (!this.badgeTimer) {
      this.badgeTimer = setInterval(() => this.refreshBadges(), 1000)
      if (this.badgeTimer.unref) this.badgeTimer.unref()
    }
  }

  dispose(): void {
    if (this.instance) {
      this.instance.unmount()
      this.instance = null
    }
    if (this.badgeTimer) {
      clearInterval(this.badgeTimer)
      this.badgeTimer = null
    }
    this.removeResizeHandler()
    this.rendered = false
  }

  /**
   * Repaint on terminal resize. Ink's OWN resize handling only clears on a
   * WIDTH DECREASE; on other resizes the terminal reflowed the printed rows
   * while Ink's relative erase still points at the old frame, so the live
   * panel DUPLICATED at several indents (the artifact the operator reported).
   * We fix it by rebuilding the Ink instance on resize — that resets the
   * internal frame buffer. This is now SAFE because the editor buffer lives in
   * the STORE (a remount no longer wipes the typed line) and we keep the log
   * watermark, so the scrollback is neither lost nor reprinted.
   */
  private installResizeHandler(): void {
    if (this.onResize) return
    this.onResize = () => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null
        if (!this.instance) return
        // Preserve the log: the watermark stays at the current length, so the
        // new instance prints NOTHING already on screen (no history loss, no
        // duplicate).
        this.printedCount = this.store.getSnapshot().log.length
        this.instance.unmount()
        this.instance = null
        this.mount()
      }, 100)
      if (this.resizeTimer.unref) this.resizeTimer.unref()
    }
    process.stdout.on('resize', this.onResize)
  }

  private removeResizeHandler(): void {
    if (this.onResize) {
      process.stdout.removeListener('resize', this.onResize)
      this.onResize = null
    }
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = null
    }
  }

  /** Emit newlines so Ink's output starts at the BOTTOM of the viewport. */
  private padToBottom(): void {
    const rows = process.stdout.rows || 24
    if (rows > 1) process.stdout.write('\n'.repeat(rows - 1))
  }

  /** Suspend the tree for a foreign full-screen UI (e.g. the /config menu). */
  pause(): void {
    if (this.instance) {
      this.instance.unmount()
      this.instance = null
    }
  }

  /** Resume after pause(): remount the tree fresh. */
  resume(): void {
    if (!this.instance && process.stdin.isTTY && process.stdout.isTTY) {
      this.mount()
    }
  }

  // ---------- submission ----------

  private handleSubmit(display: string, atts: Attachment[]): void {
    const text = expandPastes(this.store.getSnapshot().pastes, display)
    this.attachments.reset()
    // A turn separator + a BAR-marked, clearly-colored operator message, so an
    // operator turn never blends with the model's answer (operator request).
    this.printAbove(theme.turnRule('─'.repeat(contentWidth())))
    this.printAbove(
      theme.userBar('▌ ') +
        theme.user(wrapToWidth(display, contentWidth() - 2)),
    )
    this.store.set({ pastes: [] })
    // Sending a message pins the log back to the newest content: the operator
    // expects their message (and the answer) at the BOTTOM, so a viewport left
    // scrolled-up (PgUp / wheel) must snap to scroll=0 on submit.
    this.store.set({ scroll: 0 })
    this.onSubmit?.(text, atts)
    if (this.busy) this.thinking()
  }

  // ---------- status / log API ----------

  /** Print a block into the permanent log above the input. */
  printAbove(text: unknown): void {
    const s = String(text)
    const lines = s.split('\n')
    // `raw: true` — the caller already applied its own theme colors; LogView
    // must print the line verbatim instead of re-wrapping it (double ANSI
    // nesting made a tool line look dim/wrong).
    this.store.pushLogs(
      lines.map((line) => ({
        kind: 'system' as LogKind,
        text: line,
        raw: true,
      })),
    )
  }

  setStatus(text: string): void {
    this.statusText = text || ''
    this.store.set({ statusText: this.statusText })
  }

  setSendState(state: string): void {
    const next: SendState =
      state === 'generating' || state === 'paused' || state === 'settled'
        ? state
        : ''
    this.store.set({ sendState: next })
  }

  setPrompt(str: string): void {
    this.prompt = str
    this.store.set({ prompt: str })
  }

  setProvider(text: string): void {
    this.store.set({ provider: String(text || '').trim() })
  }

  /** Header info for full-screen mode (title/version/workdir). */
  setHeader(info: {
    title?: string
    version?: string
    workdir?: string
    mouseScroll?: boolean
  }): void {
    this.store.set({
      ...(info.title !== undefined ? { title: info.title } : {}),
      ...(info.version !== undefined ? { version: info.version } : {}),
      ...(info.workdir !== undefined ? { workdir: info.workdir } : {}),
      ...(info.mouseScroll !== undefined
        ? { mouseScroll: info.mouseScroll }
        : {}),
    })
  }

  setStatusLine(text: string): void {
    this.store.set({ statusLine: String(text || '').trim() })
  }

  setContextStatus(tokens: number | null | undefined): void {
    this.contextTokens =
      typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : null
    this.applyContext()
  }

  setContextLimit(limit: number): void {
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      this.contextLimit = limit
    }
    this.applyContext()
  }

  private applyContext(): void {
    const n = this.onContextQuery ? this.readContext() : this.contextTokens
    const text = formatTokenStatus(n, this.contextLimit) || null
    const level = tokenStatusLevel(n, this.contextLimit)
    this.store.set({ contextText: text, contextLevel: level })
  }

  private readContext(): number | null {
    try {
      const n = this.onContextQuery?.()
      return typeof n === 'number' ? n : null
    } catch {
      return null
    }
  }

  setLocale(locale: Locale): void {
    this.locale = locale
    this.store.set({ locale })
  }

  setCommands(commands: SlashCommand[]): void {
    this.commands = commands
    this.store.set({ commands })
  }

  setTmpDir(dir: string): void {
    this.tmpDir = dir
  }

  clear(): void {
    // The buffer lives in the input component's state; this API hook is kept
    // for compatibility but there is nothing to reset here.
  }

  refreshStatus(): void {
    this.refreshBadges()
  }

  /** Pull the live badge values (queue/tasks/toggles/context) into the store. */
  private refreshBadges(): void {
    if (this.onQueueQuery) {
      try {
        this.store.set({ queueLength: this.onQueueQuery() || 0 })
      } catch {
        /* ignore */
      }
    }
    if (this.onTasksQuery) {
      try {
        this.store.set({ tasks: this.onTasksQuery() || '' })
      } catch {
        /* ignore */
      }
    }
    if (this.onToggleQuery) {
      try {
        const s = this.onToggleQuery()
        if (s) {
          this.store.set({
            thinkingEnabled: !!s.deepThinking,
            searchEnabled: !!s.webSearch,
          })
        }
      } catch {
        /* ignore */
      }
    }
    this.applyContext()
  }

  clearScreen(): void {
    // Drop the permanent log and let Ink repaint a clean screen. A REMOUNT is
    // required because <Static> never un-renders items it has already printed:
    // clearing the store alone would leave the old rows on screen. The
    // watermark goes back to 0 so the (now empty) log is the fresh baseline.
    this.store.set({ log: [] })
    this.printedCount = 0
    if (this.instance) {
      this.instance.unmount()
      this.instance = null
      this.mount()
    }
  }

  lock(status?: string): void {
    this.locked = true
    if (status) this.setStatus(theme.dim(status))
    this.store.set({ locked: true })
  }

  unlock(): void {
    this.locked = false
    if (this.statusText) this.setStatus('')
    this.store.set({ locked: false })
  }

  // ---------- spinner-compatible interface ----------

  thinking(): void {
    if (this.pendingText) {
      this.setStatus('✎ ' + this.pendingText)
      return
    }
    this.startAnimated(randomThinkingPhrase(this.locale))
  }

  private startAnimated(baseText: string): void {
    this.store.set({
      animBase: stripEllipsis(baseText),
      animStart: Date.now(),
    })
  }

  sendPause(seconds: number): void {
    const label = translate(this.locale)('spinner.pause', { n: seconds })
    if (this.store.getSnapshot().animBase) {
      this.store.set({ animBase: stripEllipsis(label) })
    } else {
      this.startAnimated(label)
    }
  }

  setPending(text: string | null): void {
    this.pendingText = text && String(text).length ? String(text) : null
    this.store.set({ pendingText: this.pendingText })
  }

  stop(): void {
    this.statusText = ''
    this.pendingText = null
    this.store.set({ statusText: '', animBase: '', pendingText: null })
  }

  toolCall(name: string, args: unknown): void {
    const full = safeJson(args)
    void full
    const summary = summarizeToolCall(
      name,
      (typeof args === 'object' && args !== null ? args : {}) as Record<
        string,
        unknown
      >,
    )
    const detail = summary.detail
      ? truncateToWidth(summary.detail, contentWidth() - name.length - 6)
      : truncateToWidth(full, contentWidth())
    this.printAbove(
      theme.tool('🔧 ' + name) + (detail ? theme.dim('(' + detail + ')') : ''),
    )
    this.store.set({ animBase: '', sendState: '' })
    this.startAnimated(translate(this.locale)('spinner.running_tool', { name }))
    this.refreshBadges()
  }

  toolResult(result: unknown): void {
    this.stop()
    const text = typeof result === 'string' ? result : safeJson(result)
    const preview = truncateToWidth(
      text.split('\n').join(' ↵ '),
      contentWidth(),
    )
    // A simple outcome icon: a tool result that is clearly an error gets ✖, a
    // normal one ✔. The result already flows here (a mutating tool's failure
    // is reported as an Error string by the loop), so this is cheap and makes
    // a failed call visible at a glance.
    const icon = looksLikeToolError(text) ? '   ✖ ' : '   ✔ '
    this.printAbove(theme.toolResult(icon + preview))
  }

  assistant(msg: string): void {
    this.stop()
    const rendered = renderMarkdown(msg)
    this.printAbove(
      '\n' + theme.assistant(translate(this.locale)('editor.answer')),
    )
    this.printAbove(rendered)
    this.printAbove('\n')
  }

  warning(msg: string): void {
    const wrapped = wrapToWidth('⚠ ' + msg, contentWidth())
    this.printAbove('\n' + theme.warn(wrapped))
  }

  succeed(): void {}
  fail(): void {}
}

function safeJson(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
