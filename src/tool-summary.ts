// PURE tool-call summarizer — turns a tool's raw args into a SHORT, readable
// one-liner for the log (Codex / Claude Code style): `Read(src/index.ts)`
// instead of the full JSON. No terminal access, so it is unit-testable.
//
// The full args are NOT lost: when a tool has no special summary the caller
// still shows the raw JSON, so nothing is hidden.

export interface ToolSummary {
  /** The tool name (unchanged). */
  name: string
  /** A short human-readable detail (may be empty). */
  detail: string
}

/** Collapse whitespace and clip to `max` chars (single line). */
function oneLine(s: string, max = 80): string {
  const t = String(s).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  // Never cut a surrogate PAIR in half: the log line is shown to the operator
  // (and captured in the transcript), and a lone high surrogate at the end is
  // a broken code point. Same rule as truncateToolResult / capReport.
  let cut = max - 1
  const last = t.charCodeAt(cut - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut--
  return t.slice(0, cut) + '…'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * A compact, human-readable summary of a tool call. Falls back to the JSON of
 * the args when there is nothing specific to show, so no information is lost.
 */
export function summarizeToolCall(
  name: string,
  args: Record<string, unknown>,
): ToolSummary {
  const a = args || {}
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return { name, detail: oneLine(str(a.path) || str(a.file_path)) }
    case 'LS':
    case 'Glob':
      return {
        name,
        detail: oneLine(str(a.path) || str(a.pattern) || '.'),
      }
    case 'Grep':
      return {
        name,
        detail: oneLine(
          (str(a.pattern) ? '/' + str(a.pattern) + '/' : '') +
            (a.path ? ' ' + str(a.path) : ''),
        ),
      }
    case 'Bash': {
      const cmd = str(a.command)
      return { name, detail: oneLine(cmd) }
    }
    case 'Task':
      return { name, detail: oneLine(str(a.description) || str(a.prompt)) }
    case 'TodoWrite': {
      const todos = Array.isArray(a.todos) ? a.todos.length : 0
      return { name, detail: todos ? todos + ' items' : '' }
    }
    case 'respond':
      return { name, detail: oneLine(str(a.message), 60) }
    default: {
      const keys = Object.keys(a)
      if (!keys.length) return { name, detail: '' }
      try {
        return { name, detail: oneLine(JSON.stringify(a)) }
      } catch {
        return { name, detail: '' }
      }
    }
  }
}

/**
 * A cheap heuristic for the STATUS ICON next to a tool result: a result that
 * clearly reports a failure gets ✖, a normal one ✔. The agent loop returns a
 * failed tool as a string beginning with "Error"/"Missing required argument"
 * (see src/tools.ts), so matching those prefixes is reliable enough — a false
 * "✔" on an unusual error body is harmless (the text is still shown).
 */
export function looksLikeToolError(result: string): boolean {
  const head = String(result ?? '')
    .trim()
    .slice(0, 60)
    .toLowerCase()
  if (!head) return false
  const whole = String(result ?? '').toLowerCase()
  return (
    head.startsWith('error') ||
    head.startsWith('missing required argument') ||
    head.startsWith('failed') ||
    // The run's OWN failure lines are anchored at the start of a line
    // (`Exit code: N`, the `stdout:/stderr:` blocks follow). A phrase that
    // merely APPEARS in the output (a log line, a diff, a test summary) is
    // data, not a failure: a red ✖ on a successful call is just as wrong as a
    // green ✔ on a refused one.
    /^exit code\b/m.test(whole) ||
    /^command failed\b/m.test(whole) ||
    // NOT every failure is a THROWN error: a PreToolUse hook, the permission
    // policy and the operator's denial BLOCK the call and return their message
    // as the result; an unknown tool and an aborted/timed-out run are reported
    // in words too. Those calls never did their work, so a green check next to
    // them lied to the operator.
    head.startsWith('blocked by') ||
    head.startsWith('denied by') ||
    head.startsWith('unknown tool') ||
    // An MCP failure is returned AS the result (see renderMcpResult):
    // `MCP error: …` for an isError answer, `MCP error (server/tool): …`
    // when the call throws. Neither was recognised, so a failed MCP call was
    // drawn with a green check.
    head.startsWith('mcp error') ||
    head.startsWith('subagents are not available') ||
    head.startsWith('subagent failed') ||
    head.startsWith('subagent error') ||
    head.includes('process killed') ||
    head.startsWith('(aborted by the operator)') ||
    // A SANDBOX refusal: `safePath` throws
    // `Access outside the working directory is forbidden: …` and the shell
    // guard throws `Sandbox: …` (eval+cd, an unresolvable cd target, chroot).
    // Both mean the call did NOTHING, yet neither prefix matched and the
    // operator saw a green check next to a refused call.
    head.includes('outside the working directory is forbidden') ||
    head.includes('sandbox:')
  )
}
