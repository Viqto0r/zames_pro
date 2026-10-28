// N2 group (e): the DEV-ONLY self-development commands — /improve, /backlog,
// /self-review, /self-fix, /self-done, /self-list, /self-diff, /self-apply.
//
// They are registry entries with `devOnly: true`, so the guard that used to be
// a separate pre-check in the main loop is the SAME data the dispatch reads:
// a regular user gets `msg.dev_only`, dev mode runs the handler. The list here
// and `DEV_ONLY_COMMANDS` in src/commands.ts are kept in sync by a unit test.

import type { SlashCommand } from './command-registry.js'

export interface DevCommandDeps {
  improve: (arg: string) => Promise<void>
  backlog: (note: string) => Promise<void>
  selfReview: (focus: string) => Promise<void>
  selfFix: (rest: string) => Promise<void>
  selfDone: () => Promise<void>
  selfList: () => Promise<void>
  selfDiff: (name: string) => Promise<void>
  selfApply: (name: string) => Promise<void>
}

export function createDevCommands(deps: DevCommandDeps): SlashCommand[] {
  return [
    { name: 'improve', devOnly: true, handler: (c) => deps.improve(c.rest) },
    { name: 'backlog', devOnly: true, handler: (c) => deps.backlog(c.rest) },
    {
      name: 'self-review',
      devOnly: true,
      handler: (c) => deps.selfReview(c.rest),
    },
    { name: 'self-fix', devOnly: true, handler: (c) => deps.selfFix(c.rest) },
    { name: 'self-done', devOnly: true, handler: () => deps.selfDone() },
    { name: 'self-list', devOnly: true, handler: () => deps.selfList() },
    { name: 'self-diff', devOnly: true, handler: (c) => deps.selfDiff(c.rest) },
    {
      name: 'self-apply',
      devOnly: true,
      handler: (c) => deps.selfApply(c.rest),
    },
  ]
}
