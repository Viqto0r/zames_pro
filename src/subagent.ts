import type { BrowserLike, ToolDef } from './types.js'
import { loadHooks, runLifecycleHooks } from './hooks.js'
import { markInternalChat } from './sessions.js'
import type { Locale } from './i18n.js'
import type { SubagentRequest, SubagentResult } from './agent-loop.js'
import type { runAgentLoop as RunAgentLoopFn } from './agent-loop.js'

// Subagent runner (BACKLOG N36). A `Task` tool call from the model is handled
// by the agent loop as a SEAM (like onAutoCompact): it calls back into the
// caller, which owns the whole lifecycle. This module builds that callback.
//
// Why a SEPARATE chat: in zames "context" IS the DeepSeek chat, so context
// isolation can only be achieved by opening a new chat, running a nested
// agent loop there, and restoring the parent chat afterwards. The nested loop
// returns ONLY the subagent's final `respond` report; the parent never sees
// the subagent's raw turns, which is the whole point.
//
// This is deliberately SEQUENTIAL: one browser, one send slot. Parallel
// subagents would need a second page and a shared send scheduler (a change to
// browser.ts, which owns the live Playwright context) — out of scope here.

/** Hard cap on iterations for one subagent run. */
export const SUBAGENT_MAX_ITER = 30

// The report is fed back into the PARENT chat as a tool result, so a runaway
// subagent must not be able to blow up the parent's context with one answer.
// The tail is trimmed with a marker, not silently dropped.
export const SUBAGENT_REPORT_CAP = 20_000

/** Cap a subagent report before it becomes a parent-context tool result. */
export function capReport(text: string, cap = SUBAGENT_REPORT_CAP): string {
  if (text.length <= cap) return text
  return (
    text.slice(0, cap) +
    '\n… [report truncated: ' +
    (text.length - cap) +
    ' chars omitted]'
  )
}

/** Extra browser surface the runner needs on top of the agent-loop contract. */
export interface SubagentBrowser extends BrowserLike {
  newChat: () => Promise<void>
  openChat: (id: string) => Promise<boolean>
  getCurrentChatId: () => Promise<string | null>
}

export interface SubagentRunnerOptions {
  browser: SubagentBrowser
  workdir: string
  locale: Locale
  /** Nested-loop entry point (passed explicitly to avoid an import cycle). */
  runAgentLoop: typeof RunAgentLoopFn
  /**
   * Build the subagent's tool set. `readOnly` is true for the 'explore' type;
   * the caller owns createTools/undo/todos, so this module stays free of them.
   */
  buildTools: (readOnly: boolean) => ToolDef[]
  transcript?: {
    log: (event: string, data?: Record<string, unknown>) => void
  } | null
  /** Max subagent runs per task (budget). */
  maxSubagents: number
  /** Answer timeout / watchdog config for the nested loop. */
  askDeadlineMs: number
  maxAfterToolRetries: number
  /** Permission prompt for an `ask` rule inside the subagent (optional). */
  onAskPermission?: (info: {
    tool: string
    reason: string
    action: string
  }) => Promise<boolean>
}

/**
 * The subagent persona, prepended to the task message. It is deliberately NOT
 * injected as a replacement system prompt: the nested runAgentLoop builds the
 * standard system prompt itself (tool list + call format), and the model needs
 * exactly that to work. The persona only adds role + output contract.
 */
export function subagentPersona(type: 'explore' | 'general'): string {
  const base =
    'You are a SUBAGENT launched by a main coding agent to complete ONE ' +
    'self-contained sub-task in an ISOLATED chat. You do NOT see the main ' +
    "conversation's history, so rely only on the instructions below and on " +
    'the files/tools available. You cannot talk to the operator, so do not ' +
    'ask questions. When the sub-task is done, call respond with a concise, ' +
    'information-dense report: findings, exact file paths, relevant code ' +
    'snippets and a clear conclusion. Do NOT call respond until the work is ' +
    'complete.'
  if (type === 'explore') {
    return (
      base +
      '\n\nYou are in EXPLORE (read-only) mode: you may search and read files ' +
      'but you CANNOT modify anything or run mutating commands. Investigate ' +
      'and report your findings.'
    )
  }
  return base
}

/**
 * Build the `onSubagent` callback for runAgentLoop. It enforces the per-task
 * budget, opens a fresh chat, runs a nested loop (with the subagent's own
 * task text and a restricted or full tool set), restores the parent chat and
 * returns only the report.
 */
export function createSubagentRunner(
  opts: SubagentRunnerOptions,
): (req: SubagentRequest) => Promise<SubagentResult> {
  const {
    browser,
    workdir,
    locale,
    runAgentLoop,
    buildTools,
    transcript = null,
    maxSubagents,
    askDeadlineMs,
    maxAfterToolRetries,
    onAskPermission,
  } = opts

  let used = 0

  return async (req: SubagentRequest): Promise<SubagentResult> => {
    if (used >= maxSubagents) {
      return {
        ok: false,
        text:
          'Subagent budget exhausted (' +
          maxSubagents +
          ' per task). Do the remaining work yourself with the other tools.',
      }
    }
    used++

    // Resolve the parent chat id BEFORE anything else. The runner restores the
    // parent chat in its finally block, and that restore is what keeps the
    // subagent's isolated context from swallowing the parent's turn. If the id
    // cannot be resolved we must NOT run the nested loop: without it the finally
    // would skip openChat and the parent would continue INSIDE the subagent
    // chat. A couple of quick retries cover the "id not known yet" window on a
    // freshly opened chat; after that we fail safe and tell the model.
    let parentChatId: string | null = null
    for (let attempt = 0; attempt < 3 && !parentChatId; attempt++) {
      parentChatId = await browser.getCurrentChatId().catch(() => null)
      if (!parentChatId) await new Promise((r) => setTimeout(r, 300))
    }
    if (!parentChatId) {
      return {
        ok: false,
        text:
          'Cannot start a subagent: the current chat id is unknown, so the ' +
          'parent chat could not be restored afterwards (context isolation ' +
          'would be lost). Do the work yourself with the other tools.',
      }
    }

    const subTools = buildTools(req.type === 'explore')

    const taskText =
      subagentPersona(req.type) + '\n\n--- SUB-TASK ---\n' + req.prompt

    // Save the parent's send hooks: the nested loop OVERWRITES them on
    // browser, and leaving the nested (no-op) callbacks in place would kill
    // the parent's spinner/status for the rest of the task.
    const savedHooks = {
      onSendStart: browser.onSendStart ?? null,
      onSendPause: browser.onSendPause ?? null,
      onSendState: browser.onSendState ?? null,
      onNotice: browser.onNotice ?? null,
    }

    let report = ''
    let failed = ''
    try {
      report = await runAgentLoop({
        browser,
        tools: subTools,
        task: taskText,
        workdir,
        maxIterations: SUBAGENT_MAX_ITER,
        // A fresh chat gives the subagent an isolated context; the nested loop
        // opens it AND sends the standard system prompt itself.
        freshChat: true,
        sendSystemPrompt: true,
        transcript,
        locale,
        askDeadlineMs,
        maxAfterToolRetries,
        // A subagent NEVER touches BACKLOG.md, even in the operator's dev
        // mode: its sub-task is scoped, and a general subagent appending
        // "improvement" notes would be unrelated, unsupervised edits.
        selfImprovement: false,
        // No recursion: the subagent cannot spawn its own subagents.
        onSubagent: null,
        // Do not persist the subagent chat as a session, but REMEMBER its id
        // as internal so it is hidden from /sessions and never resumed.
        onChatReady: (chatId) => {
          if (chatId) markInternalChat(chatId)
        },
        // Keep the PARENT's UI alive during the nested run. The nested loop
        // OVERWRITES browser.onSendStart/… with its own callbacks; without
        // forwarding the parent's hooks the spinner and the throttle countdown
        // would go blank for the whole subagent run (a long subagent looked
        // like a frozen, dead agent). The nested loop, not this runner, owns
        // the assignment, so we hand it the functions it should install.
        onThinking: savedHooks.onSendStart ?? undefined,
        onSendPause: savedHooks.onSendPause ?? undefined,
        onSendState: savedHooks.onSendState ?? undefined,
        onNotice: savedHooks.onNotice ?? undefined,
        onAskPermission: onAskPermission
          ? (info) =>
              onAskPermission({
                tool: info.tool,
                reason: info.reason,
                action: info.action,
              })
          : undefined,
      })
    } catch (e) {
      failed = (e as Error).message
    } finally {
      // Restore the parent chat, then the hooks, so a failure in openChat
      // still leaves the hooks correct.
      if (parentChatId) {
        await browser.openChat(parentChatId).catch(() => false)
      }
      browser.onSendStart = savedHooks.onSendStart
      browser.onSendPause = savedHooks.onSendPause
      browser.onSendState = savedHooks.onSendState
      browser.onNotice = savedHooks.onNotice
    }

    // SubagentStop hook (N32): fires after the nested loop finishes, so a hook
    // can clean up or notify. Best-effort; its stdout is appended to the report.
    let hookOut = ''
    try {
      hookOut = await runLifecycleHooks(
        loadHooks(workdir),
        'SubagentStop',
        workdir,
        { type: req.type, ok: failed ? 'false' : 'true' },
      )
    } catch {}

    if (failed) return { ok: false, text: failed }
    return {
      ok: true,
      text: capReport(hookOut ? report + '\n\n' + hookOut : report),
    }
  }
}
