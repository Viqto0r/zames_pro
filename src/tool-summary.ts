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
  return t.length > max ? t.slice(0, max - 1) + '…' : t
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
