import { buildSystemPrompt } from './system-prompt.js'
import { loadProjectContext } from './context.js'
import { getGitContext, formatGitContext } from './gitTools.js'
import type { BrowserLike, ToolArgs, ToolDef, TranscriptLike } from './types.js'
import { translate, type Locale } from './i18n.js'
import { substituteAttachmentMarkers } from './commands.js'
import {
  loadHooks,
  runPreToolUse,
  runPostToolUse,
  runLifecycleHooks,
  type HooksConfig,
} from './hooks.js'
import {
  loadPermissions,
  decidePermission,
  type PermissionPolicy,
  type PermissionDecision,
} from './permissions.js'
import {
  shouldRunDiagnostics,
  runDiagnostics,
  type DiagnosticsConfig,
} from './diagnostics.js'

// A subagent request from the model's `Task` tool. The loop does NOT execute
// `Task` itself — it is a seam (like onAutoCompact): the caller (index.ts)
// opens a SEPARATE chat with its own context, runs a nested loop there and
// returns only the final report, then restores the parent chat. This keeps a
// research sub-task out of the main chat's context, which is the whole point
// of subagents in Claude Code / Codex.
export interface SubagentRequest {
  /** Full, self-contained instructions for the subagent. */
  prompt: string
  /** Short label for the log/UI (may be empty). */
  description: string
  /** 'explore' = read-only tools; 'general' = all tools. */
  type: 'explore' | 'general'
}

export interface SubagentResult {
  ok: boolean
  /** The subagent's final report, returned to the parent as the tool result. */
  text: string
}

export interface RunAgentLoopOptions {
  browser: BrowserLike
  tools: ToolDef[]
  task: string
  workdir: string
  maxIterations?: number
  freshChat?: boolean
  sendSystemPrompt?: boolean
  transcript?: TranscriptLike | null
  onThinking?: () => void
  /** Fired during the send-interval pause with the remaining seconds. */
  onSendPause?: (seconds: number) => void
  /**
   * Coarse lifecycle of one send ('generating' | 'paused' | 'settled') so the
   * UI can show an explicit phase, not just an on/off spinner. Firing it does
   * NOT change any send timing.
   */
  onSendState?: (state: 'generating' | 'paused' | 'settled') => void
  /** Service notice for the operator (rate limit, server busy, resend). */
  onNotice?: (text: string) => void
  onAssistantThought?: (text: string) => void
  onToolCall?: (name: string, args: ToolArgs) => void
  onToolResult?: (result: unknown) => void
  onAssistantMessage?: (msg: string) => void
  onChatReady?: (chatId: string | null) => void
  /** Warning for the operator (to the terminal, not only the transcript). */
  onWarning?: (text: string) => void
  debugLog?: boolean
  locale?: Locale
  /**
   * Hard deadline for one browser.ask() before the watchdog gives up on it
   * (ms). Defaults to 240s. Exposed so tests can drive the watchdog without
   * waiting four minutes.
   */
  askDeadlineMs?: number
  /**
   * How many times a browser.ask() watchdog timeout is retried before the loop
   * gives up. Default 6. Configurable via browser.maxAfterToolRetries.
   */
  maxAfterToolRetries?: number
  /**
   * Called at the safe seam AFTER a tool result and BEFORE the next send
   * when the context is nearly full. The callback compacts the chat (opens a
   * NEW chat) and returns the new chat id, or null on failure. When it fires,
   * the loop refreshes the current chat id and continues in the new chat.
   * The callback is awaited, so it naturally serializes with the throttle.
   */
  onAutoCompact?: (() => Promise<string | null>) | null
  /**
   * Fill percentage (of ui.contextLimit) at which onAutoCompact fires.
   * Default 95. Only used when onAutoCompact is provided.
   */
  autoCompactPct?: number
  /**
   * The context window size (tokens) used by the auto-compact threshold.
   * Default 1_000_000. Only used when onAutoCompact is provided.
   */
  contextLimit?: number
  /**
   * Current context size (tokens), or null when unknown. Called at the seam;
   * when null the auto-compact is skipped silently. Only used when
   * onAutoCompact is provided.
   */
  getTokenUsage?: (() => number | null) | null
  /** Files/images to attach to the FIRST message (the task). */
  attachments?: Array<{ path: string; name: string; mime: string }>
  /**
   * PreToolUse/PostToolUse hooks (see src/hooks.ts). When omitted (undefined)
   * the loop loads `.zames/hooks.json` from `workdir` once per task; pass an
   * explicit object, or null to disable hooks (tests, read-only sub-runs).
   */
  hooks?: HooksConfig | null
  /**
   * Approval policy (see src/permissions.ts). When omitted (undefined) the
   * loop loads `.zames/permissions.json` from `workdir` once per task; an
   * explicit null disables it. A `deny` rule blocks the call; an `ask` rule
   * prompts the operator through `onAskPermission`.
   */
  permissions?: PermissionPolicy | null
  /**
   * Post-edit diagnostics (N38): after a file-mutating tool, run this command
   * and append its output to the tool result so the model sees a type error
   * without a separate round-trip. Off when omitted.
   */
  diagnostics?: DiagnosticsConfig | null
  /**
   * Ask the operator to approve a tool call matched by an `ask` rule.
   * Returns true to allow, false to deny. When omitted, an `ask` rule is
   * treated as `allow` (best-effort: a non-interactive run must not stall).
   */
  onAskPermission?: (
    info: PermissionDecision & { tool: string },
  ) => Promise<boolean>
  /**
   * Dev mode: inject the BACKLOG self-improvement note into the system prompt
   * (see system-prompt.ts). Off in a normal run — an unrelated project must
   * never be told to edit a BACKLOG.md.
   */
  selfImprovement?: boolean
  /**
   * Execute a `Task` tool call (delegate a sub-task to an isolated subagent).
   * When omitted (undefined) or null, `Task` is NOT offered to the model and
   * any stray call is answered with a "not available" error. The callback
   * owns the whole lifecycle: open a fresh chat, run the nested loop, restore
   * the parent chat. The loop awaits it, so it serializes with the throttle.
   */
  onSubagent?: ((req: SubagentRequest) => Promise<SubagentResult>) | null
}

export async function runAgentLoop({
  browser,
  tools,
  task,
  workdir,
  maxIterations = 0,
  freshChat = false,
  sendSystemPrompt = false,
  transcript = null,
  attachments = [],
  onThinking = () => {},
  onSendPause = () => {},
  onSendState = () => {},
  onNotice = () => {},
  onAssistantThought = () => {},
  onToolCall = () => {},
  onToolResult = () => {},
  onAssistantMessage = () => {},
  onChatReady = () => {},
  onWarning = () => {},
  debugLog = false,
  locale = 'ru',
  askDeadlineMs = 240_000,
  maxAfterToolRetries = 6,
  onAutoCompact = null,
  autoCompactPct = 95,
  contextLimit = 1_000_000,
  getTokenUsage = null,
  hooks = undefined,
  permissions = undefined,
  diagnostics = null,
  onAskPermission = undefined,
  selfImprovement = false,
  onSubagent = null,
}: RunAgentLoopOptions): Promise<string> {
  // Resolve the hook config ONCE per task: a read per tool call would be
  // wasteful, and a mid-task edit of hooks.json is not something to chase.
  // `undefined` means "read .zames/hooks.json"; an explicit null disables
  // hooks entirely.
  const hookConfig: HooksConfig =
    hooks === undefined ? loadHooks(workdir) : (hooks ?? {})
  // Same for the approval policy (C1): read `.zames/permissions.json` once.
  const permissionPolicy: PermissionPolicy | null =
    permissions === undefined ? loadPermissions(workdir) : permissions
  // UI callbacks must NEVER break the agent loop. A rendering error (a huge
  // tool result, a broken markdown frame, a closed terminal) used to throw
  // out of the loop right after a tool call — the session looked "stopped
  // after a tool call", with a tool_call but no tool_result in the log. We
  // wrap every callback so a UI failure is swallowed and the loop continues.
  const safe = <A extends unknown[]>(fn: (...a: A) => void) => {
    return (...a: A): void => {
      try {
        fn(...a)
      } catch {
        // Intentionally ignored: the loop must survive UI failures.
      }
    }
  }
  const safeThinking = safe(onThinking)
  // Start the "working" indicator ONLY when a message is really sent (after
  // the send-pause), not while the loop is still preparing the request.
  // Previously safeThinking() fired before browser.ask(), so the spinner ran
  // through the whole throttle pause / chat-open phase with nothing in flight.
  browser.onSendStart = safeThinking
  // Animate the send-interval pause too: the browser reports the remaining
  // seconds, the UI shows an animated status instead of a frozen line.
  const safeSendPause = safe(onSendPause)
  browser.onSendPause = safeSendPause
  // Coarse lifecycle of the send (generating/paused/settled) for the status
  // line. Same best-effort wiring as the other hooks.
  browser.onSendState = safe(onSendState)
  // Service notices (rate limit, server busy, resend) must reach the OPERATOR.
  // While a LineEditor is active a raw console.error is overwritten by the
  // editor's repaint, so the operator only saw the spinner. `onNotice` prints
  // the notice ABOVE the input line.
  browser.onNotice = safe(onNotice)
  const safeAssistantThought = safe(onAssistantThought)
  const safeToolCall = safe(onToolCall)
  const safeToolResult = safe(onToolResult)
  const safeAssistantMessage = safe(onAssistantMessage)
  const safeWarning = safe(onWarning)

  // One AbortController per task. A tool gets `toolAbort.signal`; the loop
  // aborts it as soon as the operator presses Esc/Ctrl+C (browser._abort /
  // _stopped). This is what actually kills a running `npm test` instead of
  // just abandoning it.
  const toolAbort = new AbortController()
  const syncToolAbort = (): void => {
    if ((browser._abort || browser._stopped) && !toolAbort.signal.aborted) {
      toolAbort.abort()
    }
  }

  if (freshChat) {
    await browser.newChat()
    transcript?.log('new_chat')
    // SessionStart hook (N32): a fresh chat is the start of a session, so a
    // hook can inject context or set up state. Best-effort, output is logged.
    try {
      const out = await runLifecycleHooks(hookConfig, 'SessionStart', workdir)
      if (out) transcript?.log('hook_session_start', { output: out })
    } catch {}
  }

  // Report the current chat id to the caller.
  let lastReportedChatId: string | null = null
  const reportChat = async (): Promise<void> => {
    let id: string | null = null
    try {
      id = await browser.getCurrentChatId()
    } catch {
      // keep id = null
    }
    if (id && id !== lastReportedChatId) {
      lastReportedChatId = id
      onChatReady(id)
    }
  }
  await reportChat()

  if (sendSystemPrompt) {
    let gitText: string
    try {
      const ctx = await getGitContext(workdir)
      gitText = formatGitContext(ctx)
    } catch (e) {
      gitText = `(git context error: ${(e as Error).message})`
    }

    let context: Awaited<ReturnType<typeof loadProjectContext>> | null
    try {
      // Pass the task text so nested AGENTS.md/MEMORY.md for the directories
      // this task actually touches are pulled in (B6, path-scoped rules).
      context = await loadProjectContext(workdir, [task])
    } catch {
      context = null
    }

    const systemPrompt = buildSystemPrompt({
      workdir,
      tools,
      gitContext: gitText,
      locale,
      context,
      selfImprovement,
    })
    transcript?.log('system_prompt', {
      length: systemPrompt.length,
      gitContext: gitText,
      agents: context?.agents.map((f) => f.path) ?? [],
      scopedAgents: context?.scopedAgents?.map((f) => f.path) ?? [],
      memory: context?.memory.map((f) => f.path) ?? [],
      skills: context?.skills.map((s) => s.name) ?? [],
      commands: context?.commands.map((c) => c.name) ?? [],
    })
    safeThinking()
    // system-prompt is the FIRST message of a fresh chat: the rate limit only
    // applies to a rapid back-and-forth, so this send is not throttled
    // (agent: false). Throttling it used to add a useless 15s pause at the
    // start of every new session.
    await browser.ask(systemPrompt, { timeout: 60_000, agent: false })
    await reportChat()
  }

  let message = task
  if (attachments.length) {
    // Tell the model what the markers mean even when the system-prompt is not
    // (re)sent (resumed chat). The files are uploaded to the chat by the
    // browser; this note just explains the [image#N] / [file#N] markers.
    //
    // The task text keeps its COMPACT markers in the terminal, but what goes
    // to the model is expanded to the real file paths (substituteAttachment
    // Markers) so it can actually read them — a bare [file#1] is useless to
    // the model. The note below still explains the marker→file mapping.
    //
    // Numbering matches AttachmentStore: images and files are counted
    // SEPARATELY (image#1 and file#1 coexist), so the note lists them the
    // same way the substitution resolves them.
    let imgN = 0
    let fileN = 0
    const markers = attachments.map((a) => {
      const isImg =
        String(a.mime || '').startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(String(a.name || ''))
      return isImg ? '[image#' + ++imgN + ']' : '[file#' + ++fileN + ']'
    })
    message =
      substituteAttachmentMarkers(task, attachments) +
      String.fromCharCode(10) +
      String.fromCharCode(10) +
      '(The user attached ' +
      attachments.length +
      ' file(s) to this message: ' +
      markers.join(', ') +
      '. The [image#N]/[file#N] markers were replaced above by the real file paths. ' +
      'Look at the uploaded images in the chat; file copies are in <project>/tmp.)'
  }
  transcript?.log('task', { task })

  // Each guard keeps its OWN cap IN ADDITION to the shared budget below.
  // Reason: the shared budget is replenished after every successful tool, so
  // over a long chain of tools a single misbehaving guard could re-ask more
  // than intended; the per-guard cap keeps any one failure mode bounded. The
  // named counters are all reset together after a tool runs (see the reset
  // block after the tool loop).
  let malformedRetries = 0
  const MAX_MALFORMED_RETRIES = 3

  let stallRetries = 0
  const MAX_STALL_RETRIES = 5

  // SINGLE shared budget for "the answer is not a recognized tool call".
  // Before, every guard had its own counter (3+5+3+5+6 = 22 re-asks), so a
  // stuck answer hung the loop for ~20 iterations and then returned an
  // "iteration limit" stub — the exact "agent stopped" symptom. All the
  // guards below now also bump this counter, and once it is exhausted the
  // loop asks for respond exactly once and then finishes with the model's
  // own text (never a stub).
  let unparsedRetries = 0
  const MAX_UNPARSED_RETRIES = 4
  let finalRespondAsked = false
  // The operator is told ONCE that the agent is re-asking the model for a
  // proper tool call (not on every retry — that would spam the terminal).
  let toolRetryWarned = false

  // Guard against "the agent stalled": DeepSeek sometimes sends a final text
  // that merely DESCRIBES the next tool call (or cuts the answer off
  // mid-word), and the agent silently finishes the task even though the work
  // is not done. If the final answer looks like "I'll call ... now" — we
  // re-ask instead of stopping. The counter is shared so we don't loop on a
  // chatty model.
  let looksDoneRetries = 0
  const MAX_LOOKSDONE_RETRIES = 3

  // Watchdog against the agent emitting a tool call and then going silent.
  // After a tool result the expected next answer is a fresh tool call; if we
  // instead get an EMPTY answer or the EXACT same answer as the previous turn
  // (a sign the new message was not sent), we nudge instead of stopping.
  let lastRaw = ''
  // True when the PREVIOUS turn actually executed a tool. This is what
  // makes a repeated answer "stale": the tool already ran, so running it
  // again would duplicate side effects. If the previous answer looked like a
  // call but was not recognized (e.g. a DSML/XML form the strict parser
  // missed), the tool did NOT run and the echo is the only copy of the
  // call — it must be executed, not discarded as stale.
  // const ranToolLastTurn follows the previous turn's actual effect.
  let lastTurnRanTool = false
  let justRanTool = false
  let watchdogRetries = 0
  const MAX_WATCHDOG_RETRIES = 3

  // Retry budget for a browser.ask() TIMEOUT (not for content): the send did
  // not come back in time. This is separate from unparsedRetries because a
  // timeout is an infrastructure failure, not a model protocol violation.
  // Loop detection: the model sometimes repeats the SAME tool call with the
  // SAME arguments (e.g. Read the same file) turn after turn. There was no
  // explicit detector for that — the stale-answer guard only catches a
  // repeated ANSWER, not a repeated call. Track the signature of the last
  // batch of calls; after MAX_REPEAT_CALLS identical batches in a row, stop
  // running it and nudge the model to change approach.
  let lastCallSig = ''
  let repeatCallCount = 0
  const MAX_REPEAT_CALLS = 4
  let repeatWarned = false

  let afterToolRetries = 0
  // toolsRanInTask: how many tools actually ran in THIS task. The protocol
  // guard uses it to tell "started, then slipped into chat mode" (a reasoning
  // paragraph that is neither a tool call nor a real respond) from a genuine
  // short answer. We key on the STRUCTURE (work already started), not words.
  let toolsRanInTask = 0
  const MAX_AFTER_TOOL_RETRIES = Math.max(0, Math.floor(maxAfterToolRetries))
  // One-time hint when the context nears full while auto-compact is OFF:
  // the operator is told about /compact instead of silently degrading. Set
  // once per task so the terminal is not spammed.
  let contextHintShown = false
  // Token count at which the last auto-compact fired. Re-arm only after
  // the (fresh) chat grows past this plus a margin, so a chat that starts
  // above the threshold does not compact on every tool call.
  let lastAutoCompactTokens = -1
  // Set when an auto-compact returned the SAME chat id it started in — i.e.
  // the "fresh chat" never opened and the compaction did nothing. Without this
  // guard a broken newChat() (see B2) made the loop compact on EVERY tool call
  // while the context kept growing. Defense in depth: the root cause is fixed,
  // but a future regression must not turn into an endless "compacting" loop.
  let autoCompactDisabled = false
  // The message of a respond that arrived TOGETHER with real tool calls.
  // It is not delivered immediately (the tools must run first), but if the
  // model then stops without calling respond again, this is the best final
  // message we have and must reach the operator.
  let mixedRespondMsg = ''

  const iterCap = maxIterations > 0 ? maxIterations : 100000
  for (let i = 0; i < iterCap; i++) {
    // NOTE: the spinner is NOT started here. browser.onSendStart fires it
    // right when the message is actually typed/sent (after the send-pause),
    // so no spinner runs during the pre-send phase.
    // The first message (task) is user input: no throttle.
    // Subsequent ones (tool-result and resend requests) are agent sends:
    // throttled so we don't hit the rate limit.
    const isFirst = i === 0
    // Did the PREVIOUS turn actually execute a tool? Used by the stale
    // check below. We take a snapshot and immediately clear it: it will be
    // set again at the end of this iteration only if a tool really runs.
    const ranToolPrevTurn = lastTurnRanTool
    lastTurnRanTool = false
    // Safety net: browser.ask() has its own timeout, but a stuck send used to
    // block the whole loop and look like a silent stop. We race it against a
    // hard deadline and treat a timeout as a nudge (re-ask), never as a
    // final answer. The deadline is generous enough for real long answers.
    let rawResponse: string
    let askTimer: ReturnType<typeof setTimeout> | null = null
    // Kept OUTSIDE the race so we can cancel it and wait for it to settle if
    // the watchdog timer wins. Before, the losing ask() kept running (up to a
    // 300s rate-limit wait or the finish loop) while the next iteration
    // started a SECOND ask() against the same page — two sends / two Continue
    // clicks.
    // UserPromptSubmit hook (N32): runs right before the prompt is sent. Its
    // stdout is appended to the outgoing message as extra context, mirroring
    // Claude Code. Best-effort — a hook failure never blocks the send.
    try {
      const inject = await runLifecycleHooks(
        hookConfig,
        'UserPromptSubmit',
        workdir,
        { prompt: message },
      )
      if (inject) message = message + String.fromCharCode(10, 10) + inject
    } catch {}
    const askPromise = browser.ask(message, {
      agent: !isFirst,
      attachments: isFirst ? attachments : [],
    })
    try {
      rawResponse = await Promise.race([
        askPromise,
        new Promise<string>((_, reject) => {
          askTimer = setTimeout(
            () => reject(new Error('ask() watchdog timeout')),
            askDeadlineMs,
          )
          if (askTimer && typeof askTimer.unref === 'function') {
            askTimer.unref()
          }
        }),
      ])
      if (askTimer) clearTimeout(askTimer)
    } catch (e) {
      if (askTimer) clearTimeout(askTimer)
      // The timer won: cancel the still-running ask() and AWAIT its settle
      // before the next iteration starts another one. Without this the two
      // asks race on the same page. The settle is bounded: a page stuck in a
      // 30s Playwright evaluate must not hang the loop forever.
      browser.cancelPendingAsk?.()
      const settleTimer = new Promise<void>((r) => {
        const t = setTimeout(r, 60_000)
        if (typeof t.unref === 'function') t.unref()
      })
      await Promise.race([askPromise.catch(() => {}), settleTimer])
      transcript?.log('ask_timeout', {
        attempt: afterToolRetries,
        error: (e as Error).message,
      })
      // Show how many watchdog retries remain, so the operator can tell a
      // single hiccup from a genuine stall (the budget used to be invisible).
      safeWarning(
        translate(locale)('ds.answer_timeout', {
          sec: Math.round(askDeadlineMs / 1000),
          attempt: Math.min(afterToolRetries + 1, MAX_AFTER_TOOL_RETRIES),
          max: MAX_AFTER_TOOL_RETRIES,
        }),
      )
      if (afterToolRetries < MAX_AFTER_TOOL_RETRIES) {
        afterToolRetries++
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      transcript?.log('ask_timeout_exhausted', {
        message:
          'ask() did not return an answer and the retry limit is exhausted',
      })
      safeWarning(translate(locale)('ds.answer_timeout_give_up'))
      return 'ask() watchdog: no model answer received'
    }
    await reportChat()
    transcript?.log('assistant_raw', { response: rawResponse })

    // The user aborted generation (Esc/Ctrl+C).
    if (/^\s*\(прервано пользователем\)\s*$/.test(rawResponse)) {
      transcript?.log('user_aborted')
      return rawResponse
    }

    // Watchdog: after a tool result we expect a FRESH tool call. DeepSeek
    // regularly stops right here; the answer may be (a) empty, (b) an exact
    // copy of the previous turn (the new message was not sent), or (c) a
    // non-empty fragment that parses to nothing and is not a tool call (a
    // cut-off "Stale. Let me ..." or a truncated JSON). All three mean the
    // turn is unfinished: nudge instead of stopping.
    const wdEmpty = !String(rawResponse || '').trim()
    // STALE is compared on NORMALIZED text: DeepSeek often echoes the
    // previous answer with different markdown emphasis (`**done**` vs `done`),
    // which defeated an exact match and made the loop run the SAME tool again —
    // the "stopped after a tool call" signature with a duplicate call.
    //
    // AN ECHO IS NOT ALWAYS STALE: the previous answer may have been a
    // DSML/XML call that the strict parser missed and the loop never actually
    // ran. In that case the echo is the ONLY copy of the call we can get,
    // and discarding it as "stale" burns the watchdog budget and stalls the
    // agent. So we first check whether the echo itself parses as a tool
    // call (including the XML/DSML form); if it does, we do NOT treat it
    // as stale — the call gets run below like any other.
    // Stale means: the PREVIOUS turn actually ran a tool (lastTurnRanTool)
    // and this answer is a repeat of the previous one. If the previous
    // answer never ran a tool (unrecognized DSML call), the repeat is NOT
    // stale — it is the only copy of the call and must be executed.
    const staleCandidate =
      ranToolPrevTurn &&
      lastRaw.trim() !== '' &&
      (rawResponse.trim() === lastRaw.trim() ||
        normForStale(rawResponse) === normForStale(lastRaw))
    const wdStale = staleCandidate
    const wdNoCall =
      justRanTool &&
      !wdEmpty &&
      !wdStale &&
      parseToolCall(rawResponse) === null &&
      !responseLooksLikeToolCall(rawResponse)
    // A stale answer is discarded only when it does NOT parse as a tool
    // call (see wdStale above); an echo of a call that never ran is a real
    // call and must be executed, not dropped.
    if (
      !isFirst &&
      (wdEmpty || wdStale || wdNoCall) &&
      watchdogRetries < MAX_WATCHDOG_RETRIES
    ) {
      watchdogRetries++
      transcript?.log('watchdog_nudge', {
        attempt: watchdogRetries,
        empty: wdEmpty,
        stale: wdStale,
        no_call: wdNoCall,
        response: String(rawResponse || '').slice(0, 200),
      })
      message =
        'You stopped after a tool result. Continue the work: ' +
        'reply with EXACTLY one JSON tool-call object, no text before or after, ' +
        'for example: {"tool": "Bash", "args": {"command": "..."}}. ' +
        'If the task is really done — call respond with the final message.'
      await new Promise((r) => setTimeout(r, 1500))
      continue
    }
    lastRaw = rawResponse
    const parsed = parseToolCall(rawResponse)

    // SILENT CONTRACT: pre-tool text around a valid call is NEVER shown to the
    // operator. It is only handed to onAssistantThought, which is a no-op by
    // default and is not wired to the UI in src/index.ts (so ui.assistant /
    // the terminal never receives "Let me check..." / "Сейчас посмотрю").
    // We cannot strip this text from DeepSeek's own chat output with code —
    // that text is generated by the model. We can only (a) forbid it via the
    // system-prompt ("ONLY TOOL CALLS") and (b) not print it here.
    if (parsed) {
      const thought = extractPreToolText(rawResponse)
      if (thought) safeAssistantThought(thought)
    }

    const parsedCalls = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    if (parsedCalls.some((p) => p && p._permissive)) {
      transcript?.log('permissive_parse', { response: rawResponse })
      if (debugLog) {
        console.error('warning: tool-call recognized by the permissive parser')
      }
    }

    if (!parsed) {
      // The answer looks like a (possibly truncated) tool call. We catch not
      // only explicit JSON but also XML/DSML forms, "dirty" variants and
      // unclosed fragments: if such an answer is silently taken as final, the
      // agent stalls even though the model tried to call a tool.
      const looksLikeToolCall = responseLooksLikeToolCall(rawResponse)
      if (looksLikeToolCall && malformedRetries < MAX_MALFORMED_RETRIES) {
        malformedRetries++
        unparsedRetries++
        transcript?.log('malformed_toolcall', {
          attempt: malformedRetries,
          response: rawResponse,
        })
        if (debugLog) {
          console.error(
            'warning: the answer looks like a tool-call but was not recognized (attempt ' +
              malformedRetries +
              '/' +
              MAX_MALFORMED_RETRIES +
              ')',
          )
        }
        const large = String(rawResponse || '').length > 3000
        const truncHint = large
          ? 'Your call was too long and got cut off. Do NOT resend the same huge call: split it. For a large file use Write with small content_base64 pieces, or write several smaller files. Keep each tool call under about 2000 characters.'
          : 'For example: a small JSON tool-call object'
        message =
          'Your previous answer was not recognized as a tool call. ' +
          'Reply with EXACTLY one JSON tool-call object, no text before or after. ' +
          'Do NOT use XML/DSML tags — plain JSON only. ' +
          truncHint
        continue
      }

      const trimmed = (rawResponse || '').trim()
      // A service answer is a SHORT DeepSeek placeholder ("Reading…") or a
      // short rate-limit notice. Words about the rate limit in a LONG answer
      // are usually the agent itself quoting code/logs (the transcript had
      // exactly such a case: a 1365-char answer about ask() and limits), and
      // it must not be taken as "service", otherwise the agent re-asks in vain.
      const looksService =
        !trimmed ||
        trimmed.length < 2 ||
        /^(reading|thinking|searching|analyzing|generating|stop|остановить|читаю|думаю|поиск|анализ)[\s.…]*$/i.test(
          trimmed,
        ) ||
        // DeepSeek sometimes returns its OWN safety-classification block
        // ("<ds_safety>…</ds_safety>Safe") INSTEAD of an answer. It is not a
        // tool-call and not a real final answer — treat it as a service
        // answer so the loop re-asks instead of stopping on it.
        /<ds_safety>|<\/ds_safety>/i.test(trimmed) ||
        (trimmed.length <= 200 &&
          /(messages? too frequent|too many requests|rate limit|server (is )?busy|service (is )?unavailable|слишком часто|try again later)/i.test(
            trimmed,
          ))
      if (looksService && stallRetries < MAX_STALL_RETRIES) {
        stallRetries++
        unparsedRetries++
        transcript?.log('stall_retry', {
          attempt: stallRetries,
          response: rawResponse,
        })
        if (debugLog) {
          console.error(
            'warning: empty/service answer, asking to continue (attempt ' +
              stallRetries +
              '/' +
              MAX_STALL_RETRIES +
              ')',
          )
        }
        message =
          'Continue the task. If you need a tool — reply with EXACTLY ' +
          'one JSON tool-call object: {"tool": "...", "args": {...}}. ' +
          'If the task is done — call the respond tool with the final message.'
        continue
      }

      // The answer looks like "I'll call a tool now", but contains no call.
      // DeepSeek sometimes cuts the turn like this: writes "Now update
      // README…" or "Let me run the tests…" and goes silent. If this is taken
      // as final, the agent stalls without doing the work. We ask it to
      // continue and to actually call a tool this time (or respond if truly done).
      if (
        looksLikeUnfinishedWork(trimmed) &&
        looksDoneRetries < MAX_LOOKSDONE_RETRIES
      ) {
        looksDoneRetries++
        unparsedRetries++
        transcript?.log('unfinished_retry', {
          attempt: looksDoneRetries,
          response: rawResponse,
        })
        if (debugLog) {
          console.error(
            'warning: the answer looks like unfinished work, asking to continue (attempt ' +
              looksDoneRetries +
              '/' +
              MAX_LOOKSDONE_RETRIES +
              ')',
          )
        }
        message =
          'It looks like you meant to call a tool but did not. ' +
          'If the task is not finished — reply with EXACTLY one JSON ' +
          'tool-call object, no text before or after. ' +
          'If the task is really done — call respond with the final ' +
          'message to the operator.'
        continue
      }

      // STRICT: only tool calls and respond reach the operator. Plain text is
      // a protocol violation. The retries are bounded by the SINGLE
      // unparsedRetries budget, so a chatty model cannot hang the loop for
      // 20+ iterations (the old plainTextRetries + afterToolRetries combo).
      if (unparsedRetries < MAX_UNPARSED_RETRIES) {
        unparsedRetries++
        transcript?.log('plaintext_retry', {
          attempt: unparsedRetries,
          response: rawResponse.slice(0, 500),
        })
        // Tell the operator WHY nothing is happening: the model wrote text
        // instead of a tool call and the agent is asking it to continue. Only
        // once per task, otherwise the retry budget spams the terminal.
        if (!toolRetryWarned) {
          toolRetryWarned = true
          safeWarning(
            translate(locale)('ds.tool_retry', {
              attempt: unparsedRetries,
              max: MAX_UNPARSED_RETRIES,
            }),
          )
        }
        message =
          (justRanTool
            ? 'You stopped after a tool call and wrote plain text. '
            : 'You wrote plain text without a tool call. ') +
          'The task is not finished. Reply with EXACTLY one JSON tool-call ' +
          'object, no text before or after, for example: ' +
          '{\"tool\": \"Bash\", \"args\": {\"command\": \"...\"}}. ' +
          'If the task is really done — call respond with the final message.'
        continue
      }

      // Budget exhausted. Ask for respond EXACTLY once more; if the model
      // still does not call it, surface its own text as the final answer
      // (with a single warning) instead of looping to the iteration limit.
      if (!finalRespondAsked) {
        finalRespondAsked = true
        transcript?.log('final_respond_request', {
          response: rawResponse.slice(0, 500),
        })
        message =
          'Last step: call the respond tool with the final message ' +
          'to the operator. Do not write plain text — only a respond call, for example: ' +
          '{\"tool\": \"respond\", \"args\": {\"message\": \"...\"}}'
        continue
      }

      // STRUCTURAL guard against "the model slipped into chat mode":
      // after work has already started (a tool really ran in this task), a
      // plain-text answer that is neither a tool call nor a real respond must
      // NOT be returned to the operator as the final result. Returning it is
      // exactly the "agent stopped mid-task" symptom (e.g. it writes a reasoning
      // paragraph "Now let me analyze..." instead of calling a tool). We do not
      // match words here - the STRUCTURE (toolsRanInTask > 0) is the signal.
      if (toolsRanInTask > 0) {
        // Before surfacing a reasoning paragraph as a report, make ONE
        // explicit attempt to get a real respond (or a remembered mixed-respond
        // message). This turns "ambiguous text" into an unambiguous final.
        if (!finalRespondAsked) {
          finalRespondAsked = true
          transcript?.log('final_respond_request', {
            response: rawResponse.slice(0, 500),
          })
          message =
            'You stopped mid-task without finishing. If the task is DONE — ' +
            'call the respond tool with the final message to the operator ' +
            '(and nothing else): ' +
            '{"tool": "respond", "args": {"message": "..."}}. ' +
            'If it is NOT done — reply with exactly one JSON tool-call object, ' +
            'no text before or after.'
          continue
        }
        transcript?.log('protocol_violation_final', {
          response: rawResponse.slice(0, 500),
        })
        safeWarning(translate(locale)('msg.suspicious_stop'))
        // The model stopped calling tools mid-task. If it left a real message
        // in a mixed respond earlier, deliver THAT (it is a genuine final);
        // otherwise surface the last text but say explicitly that the task may
        // be incomplete: never let a reasoning paragraph masquerade as a result.
        if (mixedRespondMsg) {
          safeAssistantMessage(mixedRespondMsg)
          transcript?.log('assistant_final', { message: mixedRespondMsg })
          return mixedRespondMsg
        }
        const lastText = (rawResponse || '').trim()
        return lastText
          ? lastText +
              String.fromCharCode(10) +
              String.fromCharCode(10) +
              '(The model stopped calling tools before finishing. The task may be incomplete - check the DeepSeek chat.)'
          : 'The model stopped calling tools before finishing the task.'
      }
      const suspiciousFinal =
        responseLooksLikeToolCall(rawResponse) ||
        looksLikeUnfinishedWork((rawResponse || '').trim()) ||
        !(rawResponse || '').trim()
      if (suspiciousFinal) {
        // The answer LOOKS like a call / promises work / is empty, but could
        // not be turned into a tool call even after all retries: warn the
        // operator instead of silently printing e.g. "Stale. Let me verify".
        transcript?.log('suspicious_final', { response: rawResponse })
        safeWarning(translate(locale)('msg.suspicious_stop'))
      }
      // A meaningful plain-text answer (e.g. a final report the model forgot to
      // wrap in respond) is surfaced as-is WITHOUT a warning: after the bounded
      // re-asks it is the best available result, and warning here only
      // confused the operator in earlier sessions.
      transcript?.log('plaintext_final', { message: rawResponse })
      return rawResponse
    }

    const calls = Array.isArray(parsed) ? parsed : [parsed]

    // A respond mixed with real tool calls must NOT short-circuit the tools.
    // DeepSeek sometimes returns [{"tool":"Edit",...},{"tool":"respond",...}]
    // in ONE answer; handling respond first would silently DROP the other
    // call and the agent would look "stopped after a tool call". We only
    // finish on respond when it is the SOLE call in the answer.
    const realCalls = calls.filter((c) => c.tool !== 'respond')
    const respondCall = calls.find((c) => c.tool === 'respond')
    if (respondCall && realCalls.length > 0) {
      transcript?.log('respond_mixed_with_tools', {
        tools: realCalls.map((c) => c.tool),
      })
      // A respond mixed with real tools must NOT be dropped silently. Keep
      // its message; if the model then stops WITHOUT calling respond again, we
      // deliver this remembered message instead of a bare reasoning paragraph.
      const m =
        typeof respondCall.args.message === 'string'
          ? respondCall.args.message
          : String(respondCall.args.message ?? '')
      if (isMeaningfulRespond(m)) mixedRespondMsg = m
    }
    if (respondCall && realCalls.length === 0) {
      const msg =
        typeof respondCall.args.message === 'string'
          ? respondCall.args.message
          : String(respondCall.args.message ?? '')
      // An empty respond is not final: the model called respond but wrote no
      // summary. Finishing like this would show the operator nothing and the
      // task would "hang". We ask it to continue (within stallRetries).
      if (!isMeaningfulRespond(msg) && stallRetries < MAX_STALL_RETRIES) {
        stallRetries++
        transcript?.log('empty_respond', { attempt: stallRetries })
        if (debugLog) {
          console.error(
            'warning: empty respond, asking to continue (attempt ' +
              stallRetries +
              '/' +
              MAX_STALL_RETRIES +
              ')',
          )
        }
        message =
          'You called respond with an empty message. If the task is done — ' +
          'call respond with the final message to the operator. If not — ' +
          'continue the work with a tool call.'
        continue
      }
      // An EMPTY respond must NEVER be a silent final: the operator would see
      // nothing and the task would look "stopped after a tool call". If the
      // retry budget is exhausted, warn the operator and keep the run open
      // instead of returning an empty string. Only a NON-empty respond ends
      // the task normally.
      if (!isMeaningfulRespond(msg)) {
        transcript?.log('empty_respond_exhausted', { response: rawResponse })
        safeWarning(
          'The model called respond without text, and the retry limit is exhausted. ' +
            'Check the DeepSeek chat manually.',
        )
        return 'The model produced no final message (empty respond).'
      }
      safeAssistantMessage(msg)
      transcript?.log('assistant_final', { message: msg })
      return msg
    }

    const results = []
    // When respond came together with real tools, skip respond here: its
    // message must NOT be delivered before the tools' results are known.
    // The model will get the tool results and can call respond again.
    const callsToRun = realCalls.length > 0 ? realCalls : calls

    // Stable signature of this batch (sorted keys) for loop detection.
    const callSig = callsToRun
      .map(
        (c) =>
          c.tool +
          ':' +
          JSON.stringify(c.args, Object.keys(c.args || {}).sort()),
      )
      .join('|')
    if (callSig && callSig === lastCallSig) repeatCallCount++
    else {
      lastCallSig = callSig
      repeatCallCount = 1
      repeatWarned = false
    }
    if (repeatCallCount >= MAX_REPEAT_CALLS) {
      transcript?.log('tool_loop_detected', {
        sig: callSig.slice(0, 300),
        count: repeatCallCount,
      })
      if (!repeatWarned) {
        repeatWarned = true
        safeWarning(translate(locale)('msg.tool_loop'))
      }
      // Reset so a single nudge does not carry into the next different call.
      repeatCallCount = 0
      lastCallSig = ''
      message =
        'You have called the SAME tool with the SAME arguments several times ' +
        'in a row. Stop repeating it. Either try a different tool or approach, ' +
        'or, if the task is done, call respond with the final message. Do NOT ' +
        'repeat the identical call.'
      continue
    }

    // N34: several READ-ONLY calls in one batch are independent, so run them
    // concurrently instead of one-by-one (the model often emits 4-6 Reads in a
    // single answer and each awaited round-trip added latency). The fast path
    // is deliberately NARROW: it is taken only when EVERY call is a known
    // read-only tool, no PreToolUse hook is configured (hooks can block/deny)
    // and no call matches an `ask` permission rule (a concurrent operator
    // prompt would race). Anything else keeps the strict sequential loop, so
    // mutating side effects never reorder.
    const PARALLEL_SAFE = new Set(['Read', 'Glob', 'Grep', 'LS', 'WebFetch'])
    const readOnlyBatch =
      callsToRun.length > 1 &&
      !(hookConfig.PreToolUse && hookConfig.PreToolUse.length) &&
      callsToRun.every(
        (c) =>
          PARALLEL_SAFE.has(c.tool) &&
          tools.some((t) => t.name === c.tool) &&
          decidePermission(permissionPolicy, c.tool, c.args).action !== 'ask',
      )

    if (readOnlyBatch) {
      for (const c of callsToRun) {
        safeToolCall(c.tool, c.args)
        transcript?.log('tool_call', { tool: c.tool, args: c.args })
      }
      // Results are pushed in the ORIGINAL order below, so the model sees the
      // batch as before — only the waiting overlaps.
      const settled = await Promise.all(
        callsToRun.map(async (c) => {
          const tool = tools.find((t) => t.name === c.tool)!
          const toolStart = Date.now()
          let result: unknown
          try {
            result = await tool.fn(c.args, { signal: toolAbort.signal })
          } catch (e) {
            result = `Error: ${(e as Error).message}`
          }
          return { call: c, result, toolMs: Date.now() - toolStart }
        }),
      )
      for (const { call: c, result, toolMs } of settled) {
        safeToolResult(result)
        transcript?.log('tool_result', {
          tool: c.tool,
          result: String(result),
          durationMs: toolMs,
        })
        results.push({ tool: c.tool, result })
      }
      // Same abort contract as the sequential loop: an Esc during the batch
      // must stop before its results are fed to the model.
      if (browser._abort || browser._stopped) {
        transcript?.log('user_aborted')
        return '(прервано пользователем)'
      }
    }

    if (!readOnlyBatch)
      for (const call of callsToRun) {
        // `Task` is a SEAM, not an ordinary tool: it is handled by the caller's
        // onSubagent callback (a separate chat with its own context). It is not
        // in `tools` when subagents are disabled, so it is matched by name here
        // BEFORE the unknown-tool branch. With no callback we answer honestly
        // instead of pretending the tool exists.
        if (call.tool === 'Task') {
          const rawPrompt =
            typeof call.args.prompt === 'string' ? call.args.prompt.trim() : ''
          const rawType = String(call.args.subagent_type ?? '').toLowerCase()
          const subType: 'explore' | 'general' =
            rawType === 'explore' ? 'explore' : 'general'
          const rawDesc =
            typeof call.args.description === 'string'
              ? call.args.description
              : ''
          if (!onSubagent || !rawPrompt) {
            const err = !onSubagent
              ? 'Subagents are not available in this run. Do the work yourself with the other tools.'
              : 'Task requires a non-empty `prompt` argument.'
            safeToolResult(err)
            transcript?.log('tool_error', { tool: 'Task', error: err })
            results.push({ tool: 'Task', result: err })
            continue
          }
          syncToolAbort()
          safeToolCall('Task', call.args)
          transcript?.log('subagent_start', {
            type: subType,
            description: rawDesc,
            prompt: rawPrompt,
          })
          const poll = setInterval(syncToolAbort, 100)
          if (typeof poll.unref === 'function') poll.unref()
          const subStart = Date.now()
          let subResult: SubagentResult
          try {
            subResult = await onSubagent({
              prompt: rawPrompt,
              description: rawDesc,
              type: subType,
            })
          } catch (e) {
            subResult = {
              ok: false,
              text: `Subagent error: ${(e as Error).message}`,
            }
          } finally {
            clearInterval(poll)
          }
          const subText = String(subResult.text || '').trim()
          const subOut = subResult.ok
            ? subText || '(the subagent returned no report)'
            : `Subagent failed: ${subText || 'unknown error'}`
          safeToolResult(subOut)
          transcript?.log('subagent_done', {
            type: subType,
            ok: subResult.ok,
            chars: subText.length,
            durationMs: Date.now() - subStart,
          })
          results.push({ tool: 'Task', result: subOut })
          // The subagent switched the chat underneath us and the callback has
          // already restored the parent chat. Clear the stale-echo baseline:
          // the capture left over from the subagent's chat would otherwise make
          // the watchdog compare the parent's next answer against IT and fire.
          lastRaw = ''
          if (browser._abort || browser._stopped) {
            transcript?.log('user_aborted')
            return '(прервано пользователем)'
          }
          continue
        }

        const tool = tools.find((t) => t.name === call.tool)

        if (!tool) {
          const err = `Unknown tool: ${call.tool}`
          safeToolResult(err)
          transcript?.log('tool_error', { tool: call.tool, error: err })
          results.push({ tool: call.tool, result: err })
          continue
        }

        // The operator may have pressed Esc while we were parsing/among the
        // previous calls — make sure the signal reflects it before we start.
        syncToolAbort()
        safeToolCall(call.tool, call.args)
        transcript?.log('tool_call', { tool: call.tool, args: call.args })

        // PreToolUse hooks run BEFORE the tool. A non-zero exit BLOCKS the call:
        // its output becomes the tool result and the tool itself never runs.
        // Best-effort by design — hooks must not be able to kill the loop.
        const denial = await runPreToolUse(
          hookConfig,
          call.tool,
          call.args,
          workdir,
        )
        if (denial !== null) {
          const blocked = `Blocked by PreToolUse hook: ${denial}`
          transcript?.log('hook_pre_deny', { tool: call.tool, reason: denial })
          safeToolResult(blocked)
          transcript?.log('tool_result', {
            tool: call.tool,
            result: blocked,
          })
          results.push({ tool: call.tool, result: blocked })
          continue
        }

        // Approval policy (C1): a `deny` rule blocks the call (like a PreToolUse
        // denial); an `ask` rule prompts the operator. Hooks stay authoritative
        // for programmatic guards — this is the human-in-the-loop layer.
        const decision = decidePermission(
          permissionPolicy,
          call.tool,
          call.args,
        )
        if (decision.action === 'deny') {
          const blocked = `Blocked by permission policy: ${decision.reason}`
          transcript?.log('permission_deny', {
            tool: call.tool,
            reason: decision.reason,
          })
          safeToolResult(blocked)
          transcript?.log('tool_result', {
            tool: call.tool,
            result: blocked,
          })
          results.push({ tool: call.tool, result: blocked })
          continue
        }
        if (decision.action === 'ask' && onAskPermission) {
          let allowed: boolean
          try {
            allowed = await onAskPermission({ ...decision, tool: call.tool })
          } catch {
            allowed = false
          }
          if (!allowed) {
            const blocked = `Denied by operator: ${decision.reason}`
            transcript?.log('permission_denied', {
              tool: call.tool,
              reason: decision.reason,
            })
            safeToolResult(blocked)
            transcript?.log('tool_result', {
              tool: call.tool,
              result: blocked,
            })
            results.push({ tool: call.tool, result: blocked })
            continue
          }
        }

        let result
        // While the tool runs, poll for an Esc/Ctrl+C: the abort flag is a plain
        // boolean set by stopGeneration(), so the only way to turn it into a
        // child-process kill is to check it periodically. 100ms is cheap and
        // makes Esc feel immediate.
        const poll = setInterval(syncToolAbort, 100)
        if (typeof poll.unref === 'function') poll.unref()
        // Time the tool (T-D3): the transcript carries durationMs so /cost can
        // show where the time goes (frequent Read→Edit cycles vs slow Bash).
        const toolStart = Date.now()
        try {
          result = await tool.fn(call.args, { signal: toolAbort.signal })
        } catch (e) {
          result = `Error: ${(e as Error).message}`
        } finally {
          clearInterval(poll)
        }
        const toolMs = Date.now() - toolStart

        // PostToolUse hooks run AFTER the tool; their stdout is appended to the
        // result (e.g. `prettier` output) before it is fed back to the model.
        // Best-effort: a hook failure is ignored, the tool result still stands.
        const post = await runPostToolUse(
          hookConfig,
          call.tool,
          call.args,
          String(result),
          workdir,
        )
        if (post) {
          transcript?.log('hook_post_output', { tool: call.tool, output: post })
          result = `${String(result)}

[PostToolUse hook]
${post}`
        }

        // N38: after a file-mutating tool, run the project's own check and
        // append its summary, so a type error reaches the model immediately
        // instead of costing a whole round-trip. Best-effort and capped.
        if (shouldRunDiagnostics(diagnostics, call.tool)) {
          const diag = runDiagnostics(workdir, diagnostics)
          if (diag) {
            transcript?.log('diagnostics', { tool: call.tool, output: diag })
            result = `${String(result)}

[diagnostics]
${diag}`
          }
        }

        safeToolResult(result)
        transcript?.log('tool_result', {
          tool: call.tool,
          result: String(result),
          durationMs: toolMs,
        })
        results.push({ tool: call.tool, result })

        // The operator pressed Esc/Ctrl+C while the tool was running. The tool
        // itself has finished (we cannot kill an arbitrary child process from
        // here), but we must NOT feed its result back to the model and must NOT
        // run the remaining calls in this batch — that would keep the agent
        // going after an explicit stop.
        if (browser._abort || browser._stopped) {
          transcript?.log('user_aborted')
          return '(прервано пользователем)'
        }
      }

    // A tool just ran — the next answer is expected to be a fresh tool call.
    // Reset the watchdog so the next empty/repeated answer is nudged.
    justRanTool = true
    toolsRanInTask++
    // The tool really executed on this turn. The NEXT iteration will treat
    // a repeat of this answer as stale only because of this flag (see NEXT,
    // not the current, justRanTool check).
    lastTurnRanTool = true
    watchdogRetries = 0
    // A fresh tool call just ran: reset the per-tool-result nudge budget so
    // a long chain of tools is not cut off by an earlier bad turn.
    afterToolRetries = 0
    // Real progress was made, so the "unparsed answer" budget is replenished:
    // a long chain of tools must not run out of it because of earlier hiccups.
    unparsedRetries = 0
    // Reset ALL per-task retry counters after a successful tool, not just
    // the three above. stallRetries/looksDoneRetries/malformedRetries used to
    // live for the WHOLE task, so over a long chain of tools their budgets
    // could be exhausted by earlier hiccups and the guards silently stopped
    // protecting against "stopped after a tool call".
    stallRetries = 0
    looksDoneRetries = 0
    malformedRetries = 0
    finalRespondAsked = false

    if (results.length === 1) {
      const r = results[0]
      const resultStr =
        typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
      message = `Tool result for ${r.tool}:\n${truncateToolResult(resultStr, 12_000)}`
    } else {
      message = results
        .map((r) => {
          const resultStr =
            typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
          return `Tool result for ${r.tool}:\n${truncateToolResult(resultStr, 8000)}`
        })
        .join('\n\n')
    }

    // Auto-compact at the ONLY safe seam — after a tool result and before
    // the next send. Never mid-generation, never during a rate-limit wait, and
    // never between the task and the first send (this block runs only after a
    // tool really executed). The callback is awaited, so it serializes with the
    // send throttle. When it returns a NEW chat id we refresh the message's
    // chat and continue in the fresh chat.
    if (
      onAutoCompact &&
      getTokenUsage &&
      !browser._abort &&
      !browser._stopped
    ) {
      const tokens = getTokenUsage()
      if (tokens !== null && Number.isFinite(tokens) && tokens > 0) {
        const pct = (tokens / contextLimit) * 100
        const firedRecently = lastAutoCompactTokens >= 0
        // Re-arm only once the counter grows past the point we compacted at
        // (plus a small margin), so a fresh chat does not compact again on
        // every tool call.
        const armed = !firedRecently || tokens > lastAutoCompactTokens + 1
        if (pct >= autoCompactPct && armed && !autoCompactDisabled) {
          lastAutoCompactTokens = tokens
          safeWarning(
            translate(locale)('compact.auto_trigger', {
              pct: String(Math.round(pct)),
              tokens: String(tokens),
            }),
          )
          transcript?.log('auto_compact_trigger', { tokens, pct })
          try {
            const beforeChat = await browser
              .getCurrentChatId()
              .catch(() => null)
            const newChat = await onAutoCompact()
            if (newChat) {
              if (beforeChat && newChat === beforeChat) {
                // The chat did NOT change: the summary was posted back into
                // the old chat and the context was not reset. Warn once and
                // stop auto-compacting for the rest of the task instead of
                // looping on every tool call.
                autoCompactDisabled = true
                safeWarning(translate(locale)('compact.auto_same_chat'))
                transcript?.log('auto_compact_same_chat', { chatId: newChat })
              } else {
                transcript?.log('auto_compact_done', { chatId: newChat })
              }
              // Continue in the fresh chat. The next send is a tool-result
              // (agent: true), which is fine: the new chat already holds the
              // system prompt + carryover. `lastAutoCompactTokens` stays at the
              // count we compacted AT, so a chat that starts above the
              // threshold does not compact again until it GROWS past it.
            } else {
              transcript?.log('auto_compact_failed', {})
            }
          } catch (e) {
            transcript?.log('auto_compact_error', {
              error: (e as Error).message,
            })
          }
        }
      }
    } else if (getTokenUsage && !contextHintShown) {
      // Auto-compact is OFF (the default). The context can still fill up and
      // silently degrade the answers, so tell the operator ONCE that /compact
      // exists. Same 80% threshold the status line uses to turn red.
      const tokens = getTokenUsage()
      if (tokens !== null && Number.isFinite(tokens) && tokens > 0) {
        const pct = (tokens / contextLimit) * 100
        if (pct >= 80) {
          contextHintShown = true
          safeWarning(
            translate(locale)('context.near_full', {
              pct: String(Math.round(pct)),
            }),
          )
        }
      }
    }
  }

  return 'Iteration limit reached.'
}

// The pure helpers (tool-call parser + answer heuristics) moved to
// agent-loop-pure.ts (BACKLOG C3). They are imported for runAgentLoop and
// RE-EXPORTED, so the public API of this module is unchanged (tests import
// parseToolCall / responseLooksLikeToolCall / truncateToolResult from here).
import {
  parseToolCall,
  responseLooksLikeToolCall,
  truncateToolResult,
  normForStale,
  looksLikeUnfinishedWork,
  isMeaningfulRespond,
  extractPreToolText,
} from './agent-loop-pure.js'

export { parseToolCall, responseLooksLikeToolCall, truncateToolResult }
