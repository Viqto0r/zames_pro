// N2 group (c): the git / undo / rewind commands — /diff, /diffstat, /undo,
// /undo-list (/history), /rewind-list (/checkpoints), /rewind. All of them
// drive live stores (git, the undo store, the checkpoint store) and the editor
// lock, so the work is INJECTED; the registry owns the names, aliases and the
// argument forwarding.

import type { SlashCommand } from './command-registry.js'

export interface TreeCommandDeps {
  /** /diff and /diffstat: `staged` comes from the `--staged` flag. */
  diff: (staged: boolean) => Promise<void>
  diffstat: (staged: boolean) => Promise<void>
  undo: () => Promise<void>
  undoList: () => Promise<void>
  rewindList: () => Promise<void>
  /** /rewind <selector> [--yes]: the raw line is needed for the flag. */
  rewind: (selector: string, line: string) => Promise<void>
}

/** True when the typed line carries the `--staged` flag (any position). */
export function hasStagedFlag(line: string): boolean {
  return /(^|\s)--staged(\s|$)/.test(line)
}

export function createTreeCommands(deps: TreeCommandDeps): SlashCommand[] {
  return [
    {
      name: 'diff',
      handler: (ctx) => deps.diff(hasStagedFlag(ctx.input)),
    },
    {
      name: 'diffstat',
      handler: (ctx) => deps.diffstat(hasStagedFlag(ctx.input)),
    },
    { name: 'undo', handler: () => deps.undo() },
    {
      name: 'undo-list',
      aliases: ['history'],
      handler: () => deps.undoList(),
    },
    {
      name: 'rewind-list',
      aliases: ['checkpoints'],
      handler: () => deps.rewindList(),
    },
    {
      name: 'rewind',
      handler: (ctx) => deps.rewind(ctx.rest.split(/\s+/)[0] || '1', ctx.input),
    },
  ]
}
