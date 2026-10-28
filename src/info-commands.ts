// N2 group (a): the INFORMATIONAL slash commands — /status, /chat, /pwd,
// /transcript, /cost, /limits, /memory, /skills. Their logic drives live
// state, so everything is INJECTED (the same DI shape as config-command.ts):
// the registry calls the handler, the handler asks the deps for data and
// prints through `ctx.print`. The routing is unit-tested without a browser.

import { theme } from './theme.js'
import type { TranslateFn } from './i18n.js'
import type { SlashCommand } from './command-registry.js'

export interface InfoCommandDeps {
  t: TranslateFn
  // /status
  statusLines: () => string[]
  // /chat
  currentChatId: () => string | null
  resolveChatId: () => Promise<string | null>
  chatUrl: (id: string) => string
  // /pwd
  workdir: () => string
  // /transcript
  transcriptFile: () => string | null
  // /cost
  costReport: () => string[] | Promise<string[]>
  // /limits
  limitsReport: () => string[] | Promise<string[]>
  // /memory
  memoryReport: () => Promise<string[]>
  // /skills
  skillsReport: () => Promise<string[]>
}

/**
 * Build the informational group. The handlers only gather + print; nothing
 * here mutates session state.
 */
export function createInfoCommands(deps: InfoCommandDeps): SlashCommand[] {
  const { t } = deps
  const printLines = (lines: string[], print: (l: string) => void): void => {
    for (const line of lines) print(theme.system(line))
  }

  return [
    {
      name: 'status',
      handler: (ctx) => printLines(deps.statusLines(), ctx.print),
    },
    {
      name: 'chat',
      handler: async (ctx) => {
        const id = deps.currentChatId()
        if (id) {
          ctx.print(theme.system(t('chats.current_id', { v: id })))
          ctx.print(theme.system(`URL: ${deps.chatUrl(id)}`))
          return
        }
        const live = await deps.resolveChatId()
        ctx.print(
          theme.system(
            live ? t('chats.current_id', { v: live }) : t('chats.not_created'),
          ),
        )
      },
    },
    {
      name: 'pwd',
      handler: (ctx) => ctx.print(theme.system(deps.workdir())),
    },
    {
      name: 'transcript',
      handler: (ctx) =>
        ctx.print(theme.system(deps.transcriptFile() || t('common.off'))),
    },
    {
      name: 'cost',
      aliases: ['usage'],
      handler: async (ctx) => printLines(await deps.costReport(), ctx.print),
    },
    {
      name: 'limits',
      handler: async (ctx) => printLines(await deps.limitsReport(), ctx.print),
    },
    {
      name: 'memory',
      handler: async (ctx) => printLines(await deps.memoryReport(), ctx.print),
    },
    {
      name: 'skills',
      handler: async (ctx) => printLines(await deps.skillsReport(), ctx.print),
    },
  ]
}
