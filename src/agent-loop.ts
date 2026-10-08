import { buildSystemPrompt } from './system-prompt.js'
import { loadProjectContext } from './context.js'
import { getGitContext, formatGitContext } from './gitTools.js'
import { parseXmlToolCalls } from './xml-toolcall.js'
import type {
  BrowserLike,
  ParsedToolCall,
  ToolArgs,
  ToolCall,
  ToolDef,
  TranscriptLike,
} from './types.js'
import { translate, type Locale } from './i18n.js'
import { substituteAttachmentMarkers } from './commands.js'
import { normText } from './browser.js'
import {
  loadHooks,
  runPreToolUse,
  runPostToolUse,
  type HooksConfig,
} from './hooks.js'
import {
  loadPermissions,
  decidePermission,
  type PermissionPolicy,
  type PermissionDecision,
} from './permissions.js'

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
          subResult = { ok: false, text: `Subagent error: ${(e as Error).message}` }
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
      const decision = decidePermission(permissionPolicy, call.tool, call.args)
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

// Cap a tool result for the model, but make the truncation EXPLICIT: a bare
// slice() silently hid the tail and the model had no idea it was looking at a
// partial output (it would act on a half-read file/log).
export function truncateToolResult(text: string, limit: number): string {
  if (text.length <= limit) return text
  // Prefer a LINE boundary near the limit so the model does not read a line
  // cut in half (a half line is easy to misread as the real content). We look
  // for the last newline within the last 20% of the window; if none, fall back
  // to the hard char cut.
  let cut = limit
  const NL = String.fromCharCode(10)
  const searchFrom = Math.floor(limit * 0.8)
  const nl = text.lastIndexOf(NL, limit)
  // Cut AFTER the newline (include it) so the kept part is a whole number of
  // lines — a cut that EXCLUDED the newline left a half line before the marker.
  if (nl >= searchFrom) cut = nl + 1
  const omitted = text.length - cut
  return text.slice(0, cut) + NL + `[...truncated ${omitted} chars]`
}

// The answer looks like a tool call, but parseToolCall() did not recognize it.
// Used as a safeguard against "the agent called a tool and stopped": in that
// case runAgentLoop asks the model to resend the call instead of finishing the
// task. We catch both explicit formats and "broken" call heads
// (`<｜tool": ...`, `**tool**:`, `tool": ...`), and truncated calls.
export function responseLooksLikeToolCall(rawResponse: string): boolean {
  const raw = rawResponse || ''
  return (
    // Explicit tool-call format markers: the JSON key "tool", XML/DSML tags,
    // function_call, etc.
    /("tool"\s*:|\btool_calls?\b|\binvoke\b|\bparameter\b|DSML|function_call)/i.test(
      raw,
    ) ||
    // "tool" without an opening quote/bracket, with a junk prefix
    // (`<｜tool":`, `**tool**:`, `- tool:`): a call key, not prose.
    /(^|[^A-Za-z0-9_])(?:\*\*)?tool(?:\*\*)?["'`\u2018\u2019\u201c\u201d]*\s*:/.test(
      raw,
    ) ||
    // Keys in single quotes or unquoted: {'tool': 'Read', ...}.
    /[\{\[]\s*['"]?(tool|name|args)['"]?\s*:/.test(raw) ||
    // Truncated call: starts like a JSON object but is not closed, and has an
    // argument key (args/command/path/...). We require the opening bracket at
    // the start (after spaces/prefix) so we don't catch ordinary prose with
    // colons like "path: ...".
    (/^\s*[\[\{]/.test(raw) &&
      /["']?(?:tool|args|command|path|old_string|content|content_base64)["']?\s*:/.test(
        raw,
      )) ||
    /<\s*\|?\s*(DSML|invoke|parameter)/i.test(raw) ||
    /^\s*\[?\s*\{[^}]*$/.test(raw.trim())
  )
}

// A respond message is only a real FINAL answer when it carries some meaning.
// DeepSeek sometimes finishes with a placeholder — "...", "-", "ok", "done",
// "готово" — which looks like a stop with no report. Such a respond must not
// end the task silently: it is treated like an empty one (re-ask).
function isMeaningfulRespond(msg: string): boolean {
  const t = (msg || '').trim()
  if (!t) return false
  // Only punctuation/dots/ellipses: "...", "---", "…", "?" — not a report.
  if (/^[.…–—_*?!/\s-]+$/.test(t)) return false
  // A bare acknowledgement with no content at all. NOTE: "ok"/"done"/
  // "готово" are NOT in this list: a short "готово" is a legitimate final
  // answer for a small task, and dropping it re-opened the loop.
  if (/^(na|null|undefined)[.!]*$/i.test(t)) return false
  return true
}

// Normalize an answer for STALE comparison: collapse whitespace AND strip
// markdown emphasis/code markers. DeepSeek echoes the previous turn with a
// different emphasis (`**done**` vs `done`), which defeated an exact match and
// made the loop re-run the same tool ("stopped after a tool call").
function normForStale(s: string): string {
  return normText(s)
    .replace(/[*_`#>]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// Text that promises a tool call in the future tense but contains no call
// itself. DeepSeek regularly "hangs" like this: it writes
// "Now update README to mention …", "Let me run the tests", "I'll check now"
// and stops. Such answers must not be taken as final — otherwise the agent
// stalls without doing the work. We keep the heuristic narrow (future tense /
// intent) so we don't catch ordinary reports of completed work.
function looksLikeUnfinishedWork(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  // Long answers (reports) are left alone — anything can be in there.
  if (t.length > 600) return false
  // A final marker is already present — treat the answer as complete.
  if (/\b(done|finished|completed|готово|выполнено|завершено)\b/i.test(t)) {
    return false
  }
  const en =
    /\b(now|next|then|let me|let's|i will|i'll|i am going to|i'm going to|going to|about to|will now|time to)\b[^.!?\n]{0,120}\b(update|write|edit|read|run|check|add|fix|create|remove|delete|apply|test|commit|push|install|open|search|look|verify|change|modify|implement|review)\b/i
  const ru =
    /(^|[^а-яё])(проверю|обновлю|исправлю|добавлю|запущу|выполню|посмотрю|прочитаю|изменю|попробую|сделаю)([^а-яё]|$)/i
  return en.test(t) || ru.test(t)
}

// ============ JSON parsing ============

function repairRawControlChars(str: string): string {
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (escape) {
      out += c
      escape = false
      continue
    }
    if (c === '\\') {
      out += c
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      out += c
      continue
    }
    if (inString) {
      if (c === '\n') {
        out += '\\n'
        continue
      }
      if (c === '\r') {
        out += '\\r'
        continue
      }
      if (c === '\t') {
        out += '\\t'
        continue
      }
      const code = c.charCodeAt(0)
      if (code < 0x20) {
        out += '\\u' + code.toString(16).padStart(4, '0')
        continue
      }
    }
    out += c
  }
  return out
}

function tryParse(str: string): ToolCall | null {
  try {
    const obj = JSON.parse(str)
    if (
      obj &&
      typeof obj.tool === 'string' &&
      obj.args &&
      typeof obj.args === 'object' &&
      !Array.isArray(obj.args)
    ) {
      return obj
    }
    return null
  } catch {
    return null
  }
}

function tryParseArray(str: string): ToolCall[] | null {
  try {
    const arr = JSON.parse(str)
    if (
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr.every(
        (o) =>
          o &&
          typeof o.tool === 'string' &&
          o.args &&
          typeof o.args === 'object' &&
          !Array.isArray(o.args),
      )
    ) {
      return arr
    }
    return null
  } catch {
    return null
  }
}

function parseArgsGreedy(str: string): ToolArgs | null {
  const result: ToolArgs = {}
  let i = str.indexOf('{') + 1
  if (i === 0) return null
  const skipWs = () => {
    while (i < str.length && /[\s,]/.test(str[i])) i++
  }
  while (i < str.length) {
    skipWs()
    if (i >= str.length || str[i] === '}') break
    if (str[i] !== '"') return null
    const keyEnd = str.indexOf('"', i + 1)
    if (keyEnd === -1) return null
    const key = str.slice(i + 1, keyEnd)
    i = keyEnd + 1
    while (i < str.length && /\s/.test(str[i])) i++
    if (str[i] !== ':') return null
    i++
    while (i < str.length && /\s/.test(str[i])) i++
    if (str[i] === '"') {
      let lastEnd = -1
      let k = i + 1
      while (k < str.length) {
        if (str.charCodeAt(k) === 92) {
          k += 2
          continue
        }
        if (str[k] === '"') {
          let t = k + 1
          while (t < str.length && /\s/.test(str[t])) t++
          if (t >= str.length || str[t] === ',' || str[t] === '}') lastEnd = k
        }
        k++
      }
      if (lastEnd === -1) return null
      result[key] = unescapeValue(str.slice(i + 1, lastEnd))
      i = lastEnd + 1
      continue
    }
    if (str[i] === '{' || str[i] === '[') {
      const open = str[i]
      const close = open === '{' ? '}' : ']'
      const end = findMatching(str, i, open, close)
      if (end === -1) return null
      let parsed = null
      try {
        parsed = JSON.parse(str.slice(i, end + 1))
      } catch {
        if (open === '{') parsed = parseArgsPermissive(str.slice(i, end + 1))
      }
      if (parsed === null) return null
      result[key] = parsed
      i = end + 1
      continue
    }
    let j = i
    while (j < str.length && !/[,}]/.test(str[j])) j++
    const raw = str.slice(i, j).trim()
    if (raw === 'true') result[key] = true
    else if (raw === 'false') result[key] = false
    else if (raw === 'null') result[key] = null
    else {
      const n = Number(raw)
      result[key] = Number.isNaN(n) ? raw : n
    }
    i = j
  }
  return result
}

function parseArgsPermissive(str: string): ToolArgs | null {
  const result: ToolArgs = {}
  let i = 1
  while (i < str.length) {
    while (i < str.length && /[\s,]/.test(str[i])) i++
    if (i >= str.length || str[i] === '}') break

    if (str[i] !== '"') return null
    const keyEnd = str.indexOf('"', i + 1)
    if (keyEnd === -1) return null
    const key = str.slice(i + 1, keyEnd)
    i = keyEnd + 1

    while (i < str.length && /\s/.test(str[i])) i++
    if (str[i] !== ':') return null
    i++
    while (i < str.length && /\s/.test(str[i])) i++

    if (str[i] === '"') {
      let j = i + 1
      let value = ''
      while (j < str.length) {
        const c = str[j]
        if (c === '\\' && j + 1 < str.length) {
          value += c + str[j + 1]
          j += 2
          continue
        }
        if (c === '"') {
          let k = j + 1
          while (k < str.length && /\s/.test(str[k])) k++
          if (
            k >= str.length ||
            str[k] === ',' ||
            str[k] === '}' ||
            str[k] === ']'
          ) {
            break
          }
          value += '"'
          j++
          continue
        }
        value += c
        j++
      }
      if (j >= str.length) return null
      result[key] = unescapeValue(value)
      i = j + 1
    } else if (str[i] === '{' || str[i] === '[') {
      const open = str[i]
      const close = open === '{' ? '}' : ']'
      const end = findMatching(str, i, open, close)
      if (end === -1) return null
      const frag = str.slice(i, end + 1)
      let parsedFrag = null
      try {
        parsedFrag = JSON.parse(frag)
      } catch {
        if (open === '{') parsedFrag = parseArgsPermissive(frag)
      }
      if (parsedFrag === null) return null
      result[key] = parsedFrag
      i = end + 1
    } else {
      let j = i
      while (j < str.length && !/[,}]/.test(str[j])) j++
      const raw = str.slice(i, j).trim()
      if (raw === 'true') result[key] = true
      else if (raw === 'false') result[key] = false
      else if (raw === 'null') result[key] = null
      else {
        const n = Number(raw)
        result[key] = Number.isNaN(n) ? raw : n
      }
      i = j
    }
  }
  return result
}

function unescapeValue(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      if (n === 'n') {
        out += '\n'
        i += 2
        continue
      }
      if (n === 't') {
        out += '\t'
        i += 2
        continue
      }
      if (n === 'r') {
        out += '\r'
        i += 2
        continue
      }
      if (n === '"') {
        out += '"'
        i += 2
        continue
      }
      if (n === '\\') {
        out += '\\'
        i += 2
        continue
      }
      if (n === '/') {
        out += '/'
        i += 2
        continue
      }
      if (n === 'u' && i + 5 < s.length) {
        const hex = s.slice(i + 2, i + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 6
          continue
        }
      }
      out += c + n
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

function parseToolCallPermissive(
  text: string,
): { tool: string; args: ToolArgs } | null {
  const toolMatch = text.match(/"tool"\s*:\s*"([A-Za-z_][A-Za-z0-9_]*)"/)
  if (!toolMatch) return null
  const tool = toolMatch[1]

  // The model occasionally puts the argument keys INLINE with "tool" —
  // {"tool": "Bash", "command": "..."} — with no "args" wrapper at all.
  // The strict parser rejects it (no obj.args), and the permissive parser
  // used to bail out too (indexOf('"args"') === -1). Such a call was
  // reported as malformed and re-asked up to MAX_MALFORMED_RETRIES times;
  // after the budget ran out the run stopped with the model's text as the
  // final answer. Flatten the inline keys into args when "args" is absent.
  if (text.indexOf('"args"') === -1) {
    const braceIdx = text.indexOf('{')
    if (braceIdx === -1) return null
    const endBrace = findMatching(text, braceIdx, '{', '}')
    const objText =
      endBrace === -1
        ? text.slice(braceIdx)
        : text.slice(braceIdx, endBrace + 1)
    const inlineArgs = parseArgsPermissive(objText) || parseArgsGreedy(objText)
    if (!inlineArgs) return null
    delete inlineArgs.tool
    // The value may be a string ("command": "...") or a number/bool.
    return { tool, args: inlineArgs }
  }

  const argsIdx = text.indexOf('"args"')
  if (argsIdx === -1) return null
  const openIdx = text.indexOf('{', argsIdx)
  if (openIdx === -1) return null

  const endIdx = findMatching(text, openIdx, '{', '}')

  if (tool === 'Edit') {
    const balanced = endIdx === -1 ? null : text.slice(openIdx, endIdx + 1)
    const tailToEnd = text.slice(openIdx)
    for (const frag of [balanced, tailToEnd]) {
      if (!frag) continue
      const e = parseEditArgs(frag)
      if (e) return { tool, args: e }
    }
  }

  const frags = []
  if (endIdx !== -1) frags.push(text.slice(openIdx, endIdx + 1))
  frags.push(text.slice(openIdx))

  for (const argsStr of frags) {
    const args = parseArgsPermissive(argsStr)
    if (args) return { tool, args }
    const greedy = parseArgsGreedy(argsStr)
    if (greedy) return { tool, args: greedy }
  }
  return null
}

function parseEditArgs(str: string): ToolArgs | null {
  const keyRe = (name: string): RegExp => new RegExp('"' + name + '"\\s*:\\s*"')
  const readValue = (name: string, nextNames: string[]): string | null => {
    const m = keyRe(name).exec(str)
    if (!m) return null
    const start = m.index + m[0].length
    let end = str.length
    for (const n of nextNames) {
      const mm = keyRe(n).exec(str.slice(start))
      if (mm) {
        const absIdx = start + mm.index
        if (absIdx < end) end = absIdx
      }
    }
    let val = str.slice(start, end)
    val = val.replace(/"\s*[,}]?\s*$/, '')
    return val
  }
  const path = readValue('path', ['old_string', 'new_string'])
  const oldStr = readValue('old_string', ['new_string'])
  const newStr = readValue('new_string', [])
  if (path === null || oldStr === null || newStr === null) return null
  return { path: path, old_string: oldStr, new_string: newStr }
}

function extractJsonObjects(text: string): string[] {
  const objects = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '{') {
      const end = findMatching(text, i, '{', '}')
      if (end !== -1) {
        objects.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    if (text[i] === '[') {
      const end = findMatching(text, i, '[', ']')
      if (end !== -1) {
        objects.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    i++
  }
  return objects
}

function findMatching(
  text: string,
  openIdx: number,
  openCh: string,
  closeCh: string,
): number {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\') {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === openCh) depth++
    else if (c === closeCh) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// The model sometimes returns a tool call with single-quoted keys/strings
// ("{'tool': 'Read', 'args': {...}}") or unquoted keys
// ("{tool: \"Read\", args: {...}}"). This is not valid JSON, and without
// normalization such an answer is silently taken as final — the agent stalls
// without calling a tool. We normalize it to double quotes.
function normalizePseudoJson(str: string): string {
  // Unquoted keys: {tool: ...} or , args: ... → "tool": / "args":
  let out = str.replace(/([\{\[]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
  out = out.replace(/,\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, ', "$1":')
  // Single quotes → double quotes. We don't touch the content of already
  // double-quoted strings in a row, and escape stray double quotes inside
  // single quotes.
  let res = ''
  let inDouble = false
  let inSingle = false
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (c === '\\' && (inDouble || inSingle)) {
      res += c
      if (i + 1 < out.length) {
        res += out[i + 1]
        i++
      }
      continue
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble
      res += c
      continue
    }
    if (c === "'" && !inDouble) {
      if (!inSingle) {
        inSingle = true
        res += '"'
      } else {
        inSingle = false
        res += '"'
      }
      continue
    }
    if (inSingle && c === '"') {
      res += '\\"'
      continue
    }
    res += c
  }
  return res
}

// The model sometimes corrupts the head of a call: `<｜tool": "Bash", "args": {...}`,
// `tool": "Read", ...`, `**tool**: ...`, `- tool: ...`. Such answers have no
// opening `{`, and the `tool` key lost its first quote. If such an answer is
// taken as final, the agent silently stalls (a frequent "stop").
// We repair it: trim the junk prefix up to the word tool, add `{` and
// balance the key quotes.
function repairToolCallPreamble(text: string): string | null {
  const t = (text || '').trim()
  const m = t.match(
    /(?:^|[^A-Za-z0-9_])(?:\*\*)?(tool)(?:\*\*)?["'`\u2018\u2019\u201c\u201d]*\s*:/,
  )
  if (!m || m.index === undefined) return null
  // We look for the start from the first quote/bracket around the key, otherwise from the word tool.
  let start = m.index
  const brace = t.indexOf('{', Math.max(0, start - 1))
  if (brace !== -1 && brace < start) start = brace
  let frag = t.slice(start)
  // If the fragment does not start with `{` — we add it.
  if (!frag.startsWith('{')) {
    // The key may have lost its opening quote: tool": → "tool".
    // We trim the leading junk up to the word tool and normalize the key quotes.
    frag = frag.replace(/^[^A-Za-z0-9_]*/, '')
    frag = frag.replace(
      /^(?:\*\*)?(["'`\u2018\u2019\u201c\u201d]*)(tool)(?:\*\*)?["'`\u2018\u2019\u201c\u201d]*\s*:/,
      '"$2":',
    )
    frag = '{' + frag
  }
  return frag
}

export function parseToolCall(text: string): ParsedToolCall {
  if (!text || typeof text !== 'string') return null

  let cleaned = text.trim()
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  const candidates = extractJsonObjects(cleaned)

  // We collect EVERY recognized call, not just the first one found. The model
  // often emits several separate {"tool": ...} objects in one answer instead of
  // a single JSON array. Returning only one of them used to drop the rest and
  // could leave the agent "stalled after a tool call" with pending work.
  const collected: ToolCall[] = []
  const tryCollect = (parsed: ToolCall | ToolCall[] | null): boolean => {
    if (!parsed) return false
    if (Array.isArray(parsed)) collected.push(...parsed)
    else collected.push(parsed)
    return true
  }

  for (let i = 0; i < candidates.length; i++) {
    const raw = candidates[i]

    // A JSON array of calls is authoritative: if present, use all of it.
    const arrFirst = tryParseArray(raw)
    if (arrFirst) return arrFirst

    const arrRepaired = tryParseArray(
      raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'),
    )
    if (arrRepaired) return arrRepaired

    const first = tryParse(raw)
    if (first) {
      tryCollect(first)
      continue
    }

    const repaired = raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    const second = tryParse(repaired)
    if (second) {
      tryCollect(second)
      continue
    }

    const ctrl = repairRawControlChars(raw)
    const third = tryParse(ctrl)
    if (third) {
      tryCollect(third)
      continue
    }
    const ctrlArr = tryParseArray(ctrl)
    if (ctrlArr) return ctrlArr
  }

  if (collected.length === 1) return collected[0]
  if (collected.length > 1) return collected

  // Pseudo-JSON (single quotes / unquoted keys) — normalize and try to parse
  // as a regular call before going permissive.
  if (/['"]?tool['"]?\s*:/.test(cleaned)) {
    const norm = normalizePseudoJson(cleaned)
    if (norm !== cleaned) {
      for (const raw of extractJsonObjects(norm)) {
        const a = tryParseArray(raw)
        if (a) return a
        const o = tryParse(raw)
        if (o) return o
      }
    }
  }

  const permissive =
    parseToolCallPermissive(cleaned) ||
    parseToolCallPermissive(repairRawControlChars(cleaned)) ||
    parseToolCallPermissive(normalizePseudoJson(cleaned))
  if (permissive) return { ...permissive, _permissive: true }

  const toolIdx = cleaned.search(/["']?tool["']?\s:/)
  if (toolIdx > 0) {
    let tail = cleaned.slice(toolIdx)
    tail = tail.replace(/<[^>]*>.*$/s, '').trim()
    const tailPermissive =
      parseToolCallPermissive('{"' + tail) ||
      parseToolCallPermissive('{"' + repairRawControlChars(tail))
    if (tailPermissive) return { ...tailPermissive, _permissive: true }
  }

  const xmlCalls = parseXmlToolCalls(cleaned)
  if (xmlCalls) return Array.isArray(xmlCalls) ? xmlCalls : [xmlCalls]

  // Last attempt: "fix" a corrupted call head (`<｜tool": ...`,
  // `tool": ...`, `**tool**: ...`, `- tool: ...`). We do this ONLY as a
  // fallback, after regular parsing — otherwise it's easy to corrupt valid
  // JSON (e.g. an array of calls starts with `[`, containing `{"tool":`).
  const preamble = repairToolCallPreamble(cleaned)
  if (preamble && preamble !== cleaned) {
    const reps = [
      preamble,
      repairRawControlChars(preamble),
      normalizePseudoJson(preamble),
    ]
    for (const rep of reps) {
      for (const raw of extractJsonObjects(rep)) {
        const a = tryParseArray(raw)
        if (a) return a
        const o = tryParse(raw)
        if (o) return o
      }
    }
    const perm = parseToolCallPermissive(preamble)
    if (perm) return { ...perm, _permissive: true }
  }

  return null
}

function extractPreToolText(text: string): string {
  if (!text) return ''
  const patterns = ['{"tool"', '[{"tool"', '{"tool":', '[{"tool":']
  let earliest = -1
  for (const p of patterns) {
    const idx = text.indexOf(p)
    if (idx >= 0 && (earliest === -1 || idx < earliest)) earliest = idx
  }
  if (earliest === -1) return ''
  return text.slice(0, earliest).trim()
}
