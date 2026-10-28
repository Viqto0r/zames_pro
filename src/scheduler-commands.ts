// N2 group (d): the SCHEDULER and CONTEXT commands — /compact, /goal, /loop,
// /cron, /jobs. They all mutate long-lived session state (the chat, the goal,
// the scheduler's timers), so the state is INJECTED. The registry owns the
// names and the argument text; the handlers stay thin wrappers over the
// existing implementations.
//
// `/goal` is special: setting a condition FALLS THROUGH to the task path (the
// condition itself becomes the turn), so its handler returns a directive the
// caller turns into `taskOverride` instead of finishing the loop.

import type { SlashCommand } from './command-registry.js'

export interface SchedulerCommandDeps {
  /** /compact: the chat handover (shared with auto-compact). */
  compact: () => Promise<void>
  /** /goal: returns 'set' when a NEW condition was accepted. */
  goal: (line: string) => Promise<'set' | 'handled'>
  /** The condition to work toward, read AFTER a 'set' result. */
  currentGoal: () => string | null
  /** /loop <interval> <task>. */
  loop: (rest: string) => void
  /** /cron "<expr>" <task>. */
  cron: (rest: string) => void
  /** /jobs [rm <id>|clear]. */
  jobs: (rest: string) => void
}

/** The directive a `/goal <condition>` turn carries into the task path. */
export const GOAL_TASK_OVERRIDE =
  'Work toward this completion goal until it is satisfied. ' +
  'Do not call respond with a final summary until the condition is met.'

/**
 * Build the group. `/goal` cannot be a plain fire-and-forget handler: the
 * caller needs to know whether a directive was set, so the returned list is
 * paired with `goalDirective()` below.
 */
export function createSchedulerCommands(
  deps: SchedulerCommandDeps,
): SlashCommand[] {
  return [
    { name: 'compact', handler: () => deps.compact() },
    {
      name: 'goal',
      handler: async (ctx) => {
        const res = await deps.goal(ctx.input)
        // 'set' is signalled through the shared state; see goalDirective().
        void res
      },
    },
    { name: 'loop', handler: (ctx) => deps.loop(ctx.rest) },
    { name: 'cron', handler: (ctx) => deps.cron(ctx.rest) },
    { name: 'jobs', handler: (ctx) => deps.jobs(ctx.rest) },
  ]
}

/**
 * After dispatching group (d), the caller asks this: a freshly SET goal must
 * turn the condition itself into the next task instead of returning to the
 * prompt (Claude Code parity).
 */
export function goalDirective(
  deps: Pick<SchedulerCommandDeps, 'currentGoal'>,
  wasSet: boolean,
): string | null {
  return wasSet && deps.currentGoal() ? GOAL_TASK_OVERRIDE : null
}
