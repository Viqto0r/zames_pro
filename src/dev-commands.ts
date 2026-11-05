// N2 group (e): the DEV-ONLY self-development commands — /improve, /backlog,
// /self-review, /self-fix, /self-done, /self-list, /self-diff, /self-apply,
// plus the `/loop` improvement CYCLES (/bughunt, /textaudit, /coverage,
// /dumps, /smoke).
//
// They are registry entries with `devOnly: true`, so the guard that used to be
// a separate pre-check in the main loop is the SAME data the dispatch reads:
// a regular user gets `msg.dev_only`, dev mode runs the handler. The list here
// and `DEV_ONLY_COMMANDS` in src/commands.ts are kept in sync by a unit test.

import type { SlashCommand } from './command-registry.js'
import { LOOP_CYCLES, type LoopCycleId } from './loop-prompts.js'

export interface DevCommandDeps {
  improve: (arg: string) => Promise<void>
  backlog: (note: string) => Promise<void>
  selfReview: (focus: string) => Promise<void>
  selfFix: (rest: string) => Promise<void>
  selfDone: () => Promise<void>
  selfList: () => Promise<void>
  selfDiff: (name: string) => Promise<void>
  selfApply: (name: string) => Promise<void>
  /**
   * Start an improvement cycle: `rest` is the optional interval, the handler
   * turns it into the ONE `/loop …` line (src/loop-prompts.ts) and arms the
   * scheduler through the same path `/loop` uses.
   */
  cycle: (id: LoopCycleId, rest: string) => void
}

export function createDevCommands(deps: DevCommandDeps): SlashCommand[] {
  return [
    { name: 'improve', devOnly: true, handler: (c) => deps.improve(c.rest) },
    { name: 'backlog', devOnly: true, handler: (c) => deps.backlog(c.rest) },
    // `backlog` has BOTH a dev command (record a note) and a cycle (implement
    // an item): the command keeps its name, the cycle is reachable as
    // `/backlog` only when no explicit entry exists, so the registry list is
    // deduplicated by name below.
    ...LOOP_CYCLES.filter((id) => id !== 'backlog').map((id) => ({
      name: id,
      devOnly: true as const,
      handler: (c: { rest: string }) => deps.cycle(id, c.rest),
    })),
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
