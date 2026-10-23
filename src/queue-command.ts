import { formatQueueList, type QueuedMessage } from './commands.js'

// Pure rendering of `/queue <sub>`. The main loop can only print; the decision
// (usage hint / cleared N / one line per message / empty) is testable here.

export type QueueView =
  /** Unrecognized subcommand — show the usage line. */
  | { kind: 'usage' }
  | { kind: 'cleared'; n: number }
  | { kind: 'empty' }
  | { kind: 'list'; lines: string[] }

/**
 * The full output of `/queue` (minus the `clear` SIDE EFFECT, which the caller
 * performs on its own live queue). `sub` is the parsed subcommand or null when
 * it was not recognized; `count` is the live queue length.
 */
export function renderQueueView(
  sub: 'list' | 'clear' | null,
  count: number,
  queue: QueuedMessage[],
): QueueView {
  if (!sub) return { kind: 'usage' }
  if (sub === 'clear') return { kind: 'cleared', n: count }
  if (!count || !queue.length) return { kind: 'empty' }
  return { kind: 'list', lines: formatQueueList(queue) }
}
