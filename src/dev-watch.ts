import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// N4: in dev mode a source file that is NOT hot-reloadable silently keeps
// running its OLD copy after an edit — the fix "does not work" until zames is
// restarted. Only `browser.ts` used to be watched. This module computes the
// FULL set of such files from the source tree, so an edit to index.ts,
// run-task.ts, a provider browser, browser-login.ts, send-*.ts or the Ink TUI
// is reported too.

/**
 * Names (without extension) of the modules that /reload can hot-swap. Kept
 * here so the watcher and `index.ts`'s RELOADABLE list cannot drift: the
 * test asserts every entry is a real module.
 */
export const HOT_RELOADABLE = new Set([
  'mcp',
  'tools',
  'extraTools',
  'agent-loop',
  'system-prompt',
  'gitTools',
  'web',
  'self-review',
  'diff',
  'undo',
  'checkpoint',
  'transcript',
  'spinner',
  'config',
  'fsutil',
  'backlog',
  'commands',
  'run-task',
  'attach-refs',
])

/** A source file in `src/` (recursively) whose basename — without `.ts`/`.tsx` — is not hot-reloadable. */
export function nonReloadableSources(
  srcDir: string,
  hot: ReadonlySet<string> = HOT_RELOADABLE,
): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = path.join(dir, name)
      let isDir: boolean
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        walk(full)
        continue
      }
      const m = /\.(ts|tsx)$/.exec(name)
      if (!m) continue
      const base = name.slice(0, -m[0].length)
      // `index.ts` IS the entry point (it is not reloaded either), so it is
      // included like any other non-reloadable module.
      if (!hot.has(base)) out.push(full)
    }
  }
  walk(srcDir)
  return out.sort()
}

/**
 * Compare the mtimes of the watched files with the previous snapshot and
 * return the CHANGED ones (first call initializes the snapshot and returns
 * an empty list).
 */
export function diffChanged(
  files: string[],
  previous: Map<string, number>,
): string[] {
  const changed: string[] = []
  for (const f of files) {
    let mtime: number
    try {
      mtime = statSync(f).mtimeMs
    } catch {
      continue
    }
    const prev = previous.get(f)
    if (prev === undefined) previous.set(f, mtime)
    else if (mtime !== prev) {
      previous.set(f, mtime)
      changed.push(f)
    }
  }
  return changed
}
