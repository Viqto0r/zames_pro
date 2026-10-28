// N2 group (b): the SESSION and CHAT commands — /new (/clear), /sessions,
// /chats, /last, /resume-id. The handlers drive the live browser and the
// session store, so all of that is INJECTED. The ROUTING (a command name, its
// arguments, the aliases) is the registry's job and is unit-tested.

import { theme } from './theme.js'
import type { TranslateFn } from './i18n.js'
import type { SlashCommand } from './command-registry.js'

export interface SessionCommandDeps {
  t: TranslateFn
  /** /new: open a fresh chat, reset the checklist, clear the screen. */
  newChat: () => Promise<void>
  /** /sessions [filter]: the rendered list (a pick list in the TUI). */
  sessions: (filter: string) => Promise<void>
  /** /chats [filter]: the backend chat list. */
  chats: (filter: string) => Promise<void>
  /** /last: reopen the last chat of this directory. */
  last: () => Promise<void>
  /** /resume-id <id>: open a chat by its full id. */
  resumeId: (id: string) => Promise<void>
  /** Parse and validate an id argument (`null` = usage error printed). */
  parseResumeId: (raw: string) => string | null
  /** Usage line for a missing argument. */
  printResumeUsage: () => void
}

export function createSessionCommands(
  deps: SessionCommandDeps,
): SlashCommand[] {
  return [
    {
      name: 'new',
      aliases: ['clear'],
      handler: () => deps.newChat(),
    },
    {
      name: 'sessions',
      aliases: ['session'],
      handler: (ctx) => deps.sessions(ctx.rest.toLowerCase()),
    },
    {
      name: 'chats',
      handler: (ctx) => deps.chats(ctx.rest.toLowerCase()),
    },
    {
      name: 'last',
      handler: () => deps.last(),
    },
    {
      name: 'resume-id',
      handler: async (ctx) => {
        const id = deps.parseResumeId(ctx.rest)
        if (!id) {
          deps.printResumeUsage()
          return
        }
        await deps.resumeId(id)
      },
    },
  ]
}

/** The `<id>` usage line, localized (shared by the registry handler and tests). */
export function resumeIdUsage(t: TranslateFn): string {
  return theme.error(t('sessions.resume_id_usage'))
}
