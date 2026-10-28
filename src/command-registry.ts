// N2: the slash-command REGISTRY.
//
// `main()` in index.ts used to be one long chain of `if (lower === '/x')`
// branches (~60 of them), and help, the «/» hints, the dev-only guard and the
// dispatch were built from DIFFERENT lists — a command could be dispatched but
// missing from the help, or the other way round. A command is now a DATA
// ENTRY: name, aliases, whether it is dev-only, and a handler that receives a
// `CommandContext`. The registry below owns the informational group first; the
// remaining groups move in as they are extracted (one group per commit), and
// `printHelp`/`buildSlashCommands`/`isDevOnlyCommand` keep their existing
// sources until the last group lands.

export interface CommandContext {
  /** The line as typed, trimmed (e.g. `/status`, `/cd src`). */
  input: string
  /** The rest of the line after the command name, trimmed. */
  rest: string
  /** Print a normal operator-facing line. */
  print: (line: string) => void
}

export interface SlashCommand {
  /** Primary name WITHOUT the leading slash. */
  name: string
  /** Other names that dispatch to the same handler. */
  aliases?: string[]
  /** Hidden from `/help` and the «/» hints for a regular user. */
  devOnly?: boolean
  /** Runs the command. `true` means "handled, continue the loop". */
  handler: (ctx: CommandContext) => Promise<void> | void
}

/**
 * Match a typed line against the registry. Returns the command and its
 * arguments (everything after the matched name), or null. Matching is
 * case-insensitive and requires a word boundary: `/statusx` must NOT match
 * `/status`.
 */
export function matchCommand(
  commands: SlashCommand[],
  input: string,
): { command: SlashCommand; rest: string } | null {
  const trimmed = (input || '').trim()
  if (!trimmed.startsWith('/')) return null
  const body = trimmed.slice(1)
  const space = body.search(/\s/)
  const name = (space < 0 ? body : body.slice(0, space)).toLowerCase()
  const rest = space < 0 ? '' : body.slice(space).trim()
  for (const c of commands) {
    if (c.name.toLowerCase() === name) return { command: c, rest }
    for (const a of c.aliases || []) {
      if (a.toLowerCase() === name) return { command: c, rest }
    }
  }
  return null
}

/**
 * Dispatch a line through the registry. Returns false when nothing matched, so
 * the caller can fall through to the next group (or the task path).
 *
 * A dev-only command typed by a regular user must be REJECTED with a clear
 * message — hiding it from the help is not enough, the user can type it by
 * hand. `devMode` and `onDevOnlyRejected` are injected for that.
 */
export async function dispatchCommand(
  commands: SlashCommand[],
  input: string,
  deps: {
    print: (line: string) => void
    devMode: boolean
    onDevOnlyRejected?: (name: string) => void
  },
): Promise<boolean> {
  const hit = matchCommand(commands, input)
  if (!hit) return false
  if (hit.command.devOnly && !deps.devMode) {
    deps.onDevOnlyRejected?.(hit.command.name)
    return true
  }
  await hit.command.handler({
    input: (input || '').trim(),
    rest: hit.rest,
    print: deps.print,
  })
  return true
}
