import { formatContextSources } from './commands.js'
import { translate, type TranslateFn } from './i18n.js'

// Pure half of `/context`. The loader (loadProjectContext) reads the disk; the
// rendering — including the char counters and the system-prompt size — is pure,
// so an empty project and a truncated AGENTS.md are testable here.

export interface ContextSourcesInput {
  agents: Array<{ path: string; content: string }>
  memory: Array<{ path: string; content: string }>
  skills: Array<{ name: string; description?: string; path?: string }>
  commands: Array<{ name: string; description?: string }>
}

/** Render the `/context` report for already-loaded sources. */
export function renderContextReport(
  src: ContextSourcesInput,
  opts: { systemPromptChars?: number } = {},
  t: TranslateFn = translate('en'),
): string {
  return formatContextSources(
    src.agents || [],
    src.memory || [],
    src.skills || [],
    src.commands || [],
    opts,
    t,
  )
}
