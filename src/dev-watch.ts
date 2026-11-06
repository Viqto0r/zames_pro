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
  // index.ts reloads these too; leaving them out of THIS list made the dev
  // watcher report a false "restart zames" warning on every edit to them.
  'restore-history',
  // `input/layout` is deliberately NOT listed: index.ts's RELOADABLE does not
  // reload it either (its live consumers are not reloadable), and listing it
  // here silenced the warning for `tui/layout.ts`, which shares the basename.

  'commands',
  'run-task',
  'attach-refs',
])

/**
 * A source file in `src/` (recursively) that /reload cannot hot-swap.
 *
 * The hot list is matched on the PATH RELATIVE TO `src/` (without the
 * extension), not on the bare basename: two modules can share a name in
 * different folders (`input/layout.ts` and `tui/layout.ts`), and a basename
 * match marked the NON-reloadable one hot because of its twin — an edit to
 * `src/tui/layout.ts` then kept running the old copy with no warning.
 */
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
      // Match the RELATIVE path (POSIX separators) first, then the basename for
      // a top-level module: `input/layout.ts` is hot, `tui/layout.ts` is not.
      const rel = path
        .relative(srcDir, full)
        .split(path.sep)
        .join('/')
        .replace(/\.(ts|tsx)$/, '')
      const known = hot.has(rel) || (rel === base && hot.has(base))
      // `index.ts` IS the entry point (it is not reloaded either), so it is
      // included like any other non-reloadable module.
      if (!known) out.push(full)
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
