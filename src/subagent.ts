import type { BrowserLike, ToolDef } from './types.js'
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
  /** Dev mode: BACKLOG note in the subagent prompt. */
  selfImprovement?: boolean
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
    selfImprovement = false,
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

    const parentChatId = await browser.getCurrentChatId().catch(() => null)

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
        selfImprovement,
        // No recursion: the subagent cannot spawn its own subagents.
        onSubagent: null,
        // Do not persist the subagent chat as a session.
        onChatReady: () => {},
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

    if (failed) return { ok: false, text: failed }
    return { ok: true, text: report }
  }
}
