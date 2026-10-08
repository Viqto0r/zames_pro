import { theme } from './theme.js'
import type { DeepSeekBrowser } from './browser.js'
import type { ToolDef } from './types.js'
import type { Transcript } from './transcript.js'
import type { LineEditor } from './input.js'
import {
  withGoal,
  mergeMessages,
  isSlashCommand,
  formatDuration,
} from './commands.js'
import { formatCompactTokens, pasteReplacement, expandPastes } from './input.js'
import type {
  runAgentLoop,
  SubagentRequest,
  SubagentResult,
} from './agent-loop.js'
import type { createSpinner } from './spinner.js'
import type { TranslateFn, Locale } from './i18n.js'
import type { ZamesConfig } from './types.js'

// The TASK RUNNER, extracted from index.ts (C3 step 4). One task = send the
// first message, then drain the operator's queue (messages typed while the
// agent worked, and scheduled /loop|/cron jobs) until it is empty or the run is
// aborted. Kept as a FREE function taking its collaborators explicitly, so the
// main loop in index.ts owns the browser/queue/scheduler state and this module
// owns only the run logic.

export interface PendingMessage {
  text: string
  attachments?: Array<{ path: string; name: string; mime: string }>
  /** Set when the message came from a scheduled /loop or /cron job. */
  jobId?: number
}

export interface RunTaskOptions {
  transcript: Transcript
  freshChat: boolean
  sendSystemPrompt: boolean
  queue?: PendingMessage[]
  ui?: LineEditor | null
  onChatReady?: (chatId: string | null) => void
  /** Called at the between-tools seam when the context is nearly full. */
  onAutoCompact?: (() => Promise<string | null>) | null
  /** Fill percentage at which onAutoCompact fires. */
  autoCompactPct?: number
  /** The context window size (tokens) for the threshold. */
  contextLimit?: number
  /** Current context size (tokens) or null. */
  getTokenUsage?: (() => number | null) | null
  /** Long-lived session goal, prepended to every task message. */
  goal?: string | null
  /** Task-list summary ("tasks: 2/5") for the non-TTY spinner badge. */
  todosQuery?: (() => string) | null
  /** Called with the final assistant message of each task (/copy source). */
  onAssistantFinal?: ((msg: string) => void) | null
  /**
   * Dev mode: inject the BACKLOG self-improvement note into the system prompt
   * of a FRESH chat and into the auto-compact handover. Off in a normal run.
   */
  selfImprovement?: boolean
  /**
   * Execute a `Task` tool call (delegate to an isolated subagent). Provided by
   * the caller so this module stays free of the browser/session lifecycle.
   */
  onSubagent?: ((req: SubagentRequest) => Promise<SubagentResult>) | null
}

// Everything the task runner needs from the main module. Passed explicitly so
// this module has no import cycle with index.ts.
export interface RunTaskDeps {
  t: TranslateFn
  locale: Locale
  debug: boolean
  maxIter: number
  config: ZamesConfig
  /** Hot-reloadable logic (runAgentLoop / createSpinner) from the mod bag. */
  runAgentLoop: typeof runAgentLoop
  createSpinner: typeof createSpinner
  /** Records the last assistant answer for /copy (index.ts module state). */
  onAssistantMessage: (msg: string) => void
}

// Ask the operator to approve a tool call flagged by an `ask` permission rule
// (C1). While the LineEditor owns the terminal it must be paused first, or the
// confirmation prompt and the input line fight for the same keys. A non-TTY run
// has no way to answer, so it DENIES (never silently allows a guarded call).
export async function askOperatorConfirm(
  editor: LineEditor | null,
  question: string,
): Promise<boolean> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return false
  if (editor) editor.pause()
  try {
    const a = await promptOnce(question + ' [y/N] ')
    return /^(y|yes|\u0434|\u0434\u0430)$/i.test(a.trim())
  } catch {
    return false
  } finally {
    if (editor) editor.resume()
  }
}

// A one-question raw-TTY line reader. It is deliberately SIMPLER than the
// full promptOnce the main loop uses for free-form input (no history, no
// editing, no multi-line paste): its only callers are y/N confirmations
// (permission ask, and the same shape used by /rewind in index.ts), so a
// single-line read is all that is needed. Lives here so runTask() and
// askOperatorConfirm() are self-contained.
async function promptOnce(question: string): Promise<string> {
  const stdin = process.stdin
  const stdout = process.stdout

  // Non-TTY (pipe, redirect): read everything up to EOF as a single string.
  if (!stdin.isTTY || !stdin.setRawMode) {
    const chunks: Buffer[] = []
    return await new Promise((resolve) => {
      const onData = (b: Buffer) => chunks.push(b)
      const onEnd = () => {
        stdin.removeListener('data', onData)
        stdin.removeListener('end', onEnd)
        resolve(Buffer.concat(chunks).toString('utf-8'))
      }
      stdin.on('data', onData)
      stdin.on('end', onEnd)
      stdin.resume()
    })
  }

  const CR = String.fromCharCode(13)
  const LF = String.fromCharCode(10)
  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()
  stdout.write(question)
  return await new Promise((resolve) => {
    let line = ''
    const onData = (buf: Buffer) => {
      const s = buf.toString('utf-8')
      for (const ch of s) {
        const code = ch.charCodeAt(0)
        if (ch === CR || ch === LF) {
          stdin.removeListener('data', onData)
          if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
          stdout.write(String.fromCharCode(10))
          resolve(line)
          return
        }
        if (code === 3) {
          stdin.removeListener('data', onData)
          if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
          resolve('')
          return
        }
        if (code === 127 || code === 8) {
          if (line) {
            line = line.slice(0, -1)
            stdout.write(String.fromCharCode(8) + ' ' + String.fromCharCode(8))
          }
          continue
        }
        if (code < 32) continue
        line += ch
        stdout.write(ch)
      }
    }
    stdin.on('data', onData)
  })
}

// Watch the keyboard while the agent works in NON-TTY mode (pipes). In TTY the
// LineEditor owns this (index.ts). Input is buffered without a line editor: the
// typed text is shown in the spinner line via onChange -> ui.setPending().
// Enter sends the buffer to onQueue; an empty Enter is ignored. Backspace,
// Ctrl+U, Esc sequences (arrows/Home/End/Delete are ignored) and bracketed
// paste are supported. Returns a cleanup function.
export function watchInput({
  onEscape,
  onChange,
  onQueue,
}: {
  onEscape?: () => void
  onChange?: (text: string) => void
  onQueue?: (text: string) => void
} = {}): () => void {
  const stdin = process.stdin
  if (!stdin.isTTY || !stdin.setRawMode) return () => {}

  // Control characters are assembled from codes: this file must not contain
  // "raw" ESC/CR/LF in string literals (see AGENTS.md).
  const ESC = String.fromCharCode(27)
  const CSI = String.fromCharCode(91)
  const CR = String.fromCharCode(13)
  const LF = String.fromCharCode(10)

  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()
  process.stdout.write(ESC + '[?2004h')

  let buf = ''
  let inPaste = false
  let pasteBuf = ''
  const pastes: Array<{ marker: string; text: string }> = []
  const PASTE_START = ESC + '[200~'
  const PASTE_END = ESC + '[201~'
  const CSI_RE = new RegExp('^' + CSI + '[0-9;]*[A-Za-z~]')

  const emitChange = (): void => {
    if (onChange) onChange(buf)
  }

  // Pasted text: small pastes (1-2 lines) are flattened into one line; large
  // ones (3+ lines) are collapsed into "[Pasted lines#N]" (the original text is
  // expanded back when the message is queued). pasteReplacement() owns the
  // threshold, so the same rule the LineEditor uses applies here.
  const insert = (text: string) => {
    buf += text
      .split(CR + LF)
      .join(' ')
      .split(CR)
      .join(' ')
      .split(LF)
      .join(' ')
  }

  const insertPaste = (raw: string) => {
    const rep = pasteReplacement(raw)
    if (!rep) {
      insert(raw)
      return
    }
    pastes.push(rep)
    buf += rep.marker
  }

  function onData(data: Buffer) {
    let s = data.toString('utf-8')

    // A single Esc - abort generation. Arrows come as a whole chunk and do not
    // reach here.
    if (!inPaste && s === ESC) {
      if (onEscape) onEscape()
      return
    }

    while (s.length) {
      if (inPaste) {
        const end = s.indexOf(PASTE_END)
        if (end === -1) {
          pasteBuf += s
          s = ''
        } else {
          pasteBuf += s.slice(0, end)
          s = s.slice(end + PASTE_END.length)
          inPaste = false
          insertPaste(pasteBuf)
          pasteBuf = ''
        }
        emitChange()
        continue
      }

      const start = s.indexOf(PASTE_START)
      if (start !== -1) {
        const before = s.slice(0, start)
        s = s.slice(start + PASTE_START.length)
        inPaste = true
        pasteBuf = ''
        if (before) {
          insert(before)
          emitChange()
        }
        continue
      }

      const ch = s[0]
      const code = s.charCodeAt(0)
      s = s.slice(1)

      if (ch === CR || ch === LF) {
        const text = expandPastes(pastes, buf).trim()
        buf = ''
        pastes.length = 0
        emitChange()
        if (text && onQueue) onQueue(text)
        continue
      }
      if (code === 3) {
        // Ctrl+C - like Esc: abort generation.
        if (onEscape) onEscape()
        continue
      }
      if (code === 21) {
        // Ctrl+U - clear what was typed.
        buf = ''
        pastes.length = 0
        emitChange()
        continue
      }
      if (code === 127 || code === 8) {
        // Backspace.
        if (buf) {
          buf = buf.slice(0, -1)
          emitChange()
        }
        continue
      }
      if (ch === ESC) {
        // Escape sequence (arrows, Home/End, Delete) - skip.
        const m = s.match(CSI_RE)
        if (m) s = s.slice(m[0].length)
        continue
      }
      if (code < 32) continue // other control characters - ignore

      buf += ch
      emitChange()
    }
  }

  const handler = (data: Buffer) => onData(data)
  stdin.on('data', handler)
  return () => {
    stdin.removeListener('data', handler)
    process.stdout.write(ESC + '[?2004l')
    if (stdin.setRawMode) stdin.setRawMode(wasRaw || false)
  }
}

export interface TaskResult {
  ok: boolean
  /** Why the task failed: an agent error, an iteration limit or a watchdog. */
  error?: string
}

export async function runTask(
  deps: RunTaskDeps,
  browser: DeepSeekBrowser,
  tools: ToolDef[],
  taskText: string,
  workdir: string,
  opts: RunTaskOptions,
  attachments: Array<{ path: string; name: string; mime: string }> = [],
): Promise<TaskResult> {
  const { t, locale, debug, maxIter, config, runAgentLoop, createSpinner } =
    deps
  const {
    transcript,
    freshChat,
    sendSystemPrompt,
    queue = [],
    ui: editor,
    onChatReady,
    onAutoCompact = null,
    autoCompactPct = 95,
    contextLimit = 1_000_000,
    getTokenUsage = null,
    goal = null,
    todosQuery = null,
    selfImprovement = false,
    onSubagent = null,
  } = opts

  // In TTY mode the UI is a LineEditor: it owns the input (queue, Esc,
  // Ctrl+C) and draws the status ABOVE the permanent input line. In non-TTY
  // mode (pipes) - a regular spinner + watchInput.
  // A new task from the prompt - we reset the "stop" from the previous abort.
  browser._stopped = false
  browser._abort = false

  const ui = editor || createSpinner(locale)
  // Non-TTY parity: the ora spinner shows the same "tasks: 2/5" badge the
  // LineEditor shows (the editor gets it via onTasksQuery in main()).
  if (!editor && todosQuery && 'onTasksQuery' in ui) {
    ;(ui as { onTasksQuery?: (() => string) | null }).onTasksQuery = todosQuery
  }
  // Mark the editor busy for the WHOLE task, not only for /init and /self-fix.
  // Esc / Ctrl+C abort the current generation only while busy; without this a
  // long-running tool (Bash, npm, MCP) could not be interrupted - Esc did
  // nothing. Cleared in the finally below.
  if (editor) editor.busy = true
  const stopWatching = editor
    ? () => {}
    : watchInput({
        onEscape: () => {
          ui.stop()
          console.error(theme.warn(t('msg.abort_gen_short')))
          browser.stopGeneration().catch(() => {})
        },
        onChange: (text) => ui.setPending(text),
        onQueue: (text) => {
          queue.push({ text })
          ui.setPending(null)
          ui.stop()
          console.log(
            theme.user(t('msg.queued', { n: queue.length })) +
              theme.assistant(text),
          )
          ui.thinking()
        },
      })

  try {
    // Set when the loop ends without a real answer (iteration limit / watchdog)
    // so the one-shot mode can exit non-zero. See N5.
    let failure: string | null = null
    let next: PendingMessage & {
      freshChat: boolean
      sendSystemPrompt: boolean
    } = {
      text: taskText,
      attachments,
      freshChat,
      sendSystemPrompt,
    }

    // Execute the task, then everything the user managed to type while it ran.
    // The queue may be replenished right during draining.
    //
    // NOTE: we do NOT call ui.thinking() here. runAgentLoop() fires onThinking()
    // right before the actual browser send (after the send pause, system-prompt,
    // etc.), so the spinner only appears when a generation really starts.
    // Calling it here made the spinner run for the whole pre-send phase (chat
    // creation, throttle wait) with no generation in flight.
    while (true) {
      // T7: per-task summary (duration + number of tool calls + tokens).
      const taskStart = Date.now()
      // Token delta for THIS task: accumulated_token_usage is cumulative for
      // the whole chat, so the per-task spend is after - before. Null when the
      // counter is unknown (fresh chat / no answer yet).
      const tokensBefore = getTokenUsage ? getTokenUsage() : null
      let taskTools = 0
      const outcome = await runAgentLoop({
        browser,
        tools,
        task: withGoal(goal, next.text),
        workdir,
        maxIterations: maxIter,
        freshChat: next.freshChat,
        sendSystemPrompt: next.sendSystemPrompt,
        attachments: next.attachments || [],
        transcript,
        onThinking: () => ui.thinking(),
        onSendPause: (seconds) => ui.sendPause(seconds),
        onSendState: (state) => {
          if (editor) editor.setSendState(state)
        },
        onNotice: (msg) => ui.warning(msg),
        onToolCall: (name, toolArgs) => {
          taskTools++
          ui.toolCall(name, toolArgs)
        },
        onToolResult: (result) => ui.toolResult(result),
        onAssistantMessage: (msg) => {
          // Remember the last answer so /copy can put it on the clipboard
          // without re-reading the chat.
          deps.onAssistantMessage(msg)
          opts.onAssistantFinal?.(msg)
          ui.assistant(msg)
        },
        onWarning: (msg) => ui.warning(msg),
        onAskPermission: async (info) => {
          // C1: a rule with action "ask". Show the reason and wait for the
          // operator. In non-TTY this denies.
          ui.warning(t('perm.ask', { tool: info.tool, reason: info.reason }))
          const ok = await askOperatorConfirm(editor || null, t('perm.confirm'))
          ui.warning(ok ? t('perm.allowed') : t('perm.denied'))
          transcript?.log('permission_ask', {
            tool: info.tool,
            reason: info.reason,
            allowed: ok,
          })
          return ok
        },
        onChatReady,
        debugLog: debug,
        locale,
        askDeadlineMs: config.browser.askDeadlineMs,
        maxAfterToolRetries: config.browser.maxAfterToolRetries,
        // Auto-compact between tool calls when the context nears the window
        // limit. The callback is provided by the caller so it can refresh the
        // outer currentChatId; it serializes with the throttle because the
        // loop awaits it.
        onAutoCompact,
        autoCompactPct,
        contextLimit,
        getTokenUsage,
        selfImprovement,
        onSubagent,
      })

      // The loop may end WITHOUT a model answer: an exhausted iteration limit
      // or an ask() watchdog. Surface it instead of a silent stop.
      if (
        outcome &&
        (outcome.startsWith('Iteration limit reached') ||
          outcome.startsWith('ask() watchdog'))
      ) {
        ui.warning(outcome)
        transcript?.log('agent_no_answer', { outcome })
        failure = outcome
      }

      // T7: one summary line per task (duration + tool calls + tokens spent).
      // Printed even on an abort, so the operator sees what happened.
      const tokensAfter = getTokenUsage ? getTokenUsage() : null
      const tokenDelta =
        typeof tokensBefore === 'number' && typeof tokensAfter === 'number'
          ? Math.max(0, tokensAfter - tokensBefore)
          : null
      const summaryParts = [
        t('task_sum.dur', {
          dur: formatDuration(Date.now() - taskStart, {
            h: t('dur.h'),
            m: t('dur.m'),
            s: t('dur.s'),
          }),
        }),
        t('task_sum.tools', { n: String(taskTools) }),
      ]
      if (tokenDelta !== null) {
        summaryParts.push(
          t('task_sum.tokens', { n: formatCompactTokens(tokenDelta) }),
        )
      }
      const summary = theme.taskSummary('· ' + summaryParts.join(' · '))
      if (editor) editor.printAbove(summary)
      else console.log(summary)

      // Aborted (Esc/Ctrl+C) - we don't start the next tasks from the queue and
      // clear it, so "stop" really stops everything.
      if (browser._stopped) {
        queue.length = 0
        break
      }
      if (!queue.length) break

      // Merge the LEADING plain-text messages into ONE batch (fewer sends ->
      // less rate-limit risk and the operator's thoughts arrive together). We
      // stop at the first slash-command: it must NOT be sent as a task - it is
      // handled by the main loop, so we leave it (and anything after it) in the
      // queue and break out of this task's drain loop.
      let batchLen = 0
      while (batchLen < queue.length && !isSlashCommand(queue[batchLen].text)) {
        batchLen++
      }
      if (batchLen === 0) break
      const batch = queue.splice(0, batchLen)
      const merged = mergeMessages(batch)
      if (!merged.text.trim()) break
      ui.stop()
      const banner =
        batch.length === 1
          ? theme.user(t('msg.from_queue')) + theme.assistant(batch[0].text)
          : theme.user(t('msg.from_queue_batch', { n: batch.length })) +
            theme.assistant(t('msg.batch_joined', { n: batch.length }))
      if (editor) editor.printAbove(banner)
      else console.log(banner)
      transcript?.log('queued_task', { task: merged.text, count: batch.length })
      next = {
        text: merged.text,
        attachments: merged.attachments,
        freshChat: false,
        sendSystemPrompt: false,
      }
    }
    return failure ? { ok: false, error: failure } : { ok: true }
  } catch (e) {
    ui.stop()
    console.error(
      theme.error(String.fromCharCode(10) + t('msg.agent_error')),
      (e as Error).message,
    )
    if (debug) console.error((e as Error).stack)
    transcript?.log('agent_error', { error: (e as Error).message })
    return { ok: false, error: (e as Error).message }
  } finally {
    stopWatching()
    ui.stop()
    if (editor) editor.busy = false
    // Detach the send hooks so a later browser.ask() outside this task cannot
    // start a stale spinner.
    browser.onSendStart = null
    browser.onSendPause = null
    browser.onSendState = null
    browser.onNotice = null
  }
}
