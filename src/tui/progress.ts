// PURE parsing + rendering of the task progress shown in the status bar.
//
// `store.tasks` is the localized summary produced by index.ts (e.g.
// "задачи: 3/5" / "tasks: 3/5"). The status bar wants a small BAR (▓▓▓░░) next
// to it, so it needs the numbers back out of that string — which is what this
// module does, without knowing the locale (it only looks for `n/m`).

export interface TaskProgress {
  done: number
  total: number
}

/**
 * Extract `done`/`total` from a summary like "tasks: 3/5" or "задачи: 3/5".
 * Returns null when there is no `n/m` pair (idle / an unknown format), so the
 * caller can simply skip the bar.
 */
export function parseTaskProgress(summary: string): TaskProgress | null {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(String(summary ?? ''))
  if (!m) return null
  const done = Number(m[1])
  const total = Number(m[2])
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) {
    return null
  }
  return { done: Math.min(done, total), total }
}

/**
 * Render a fixed-width progress bar: `done` filled cells out of `width`.
 * Uses `▓`/`░` so it reads as a bar even without color. When `width` is 0 or
 * the numbers are invalid the result is ''. A zero-total bar is all empty.
 */
export function renderProgressBar(p: TaskProgress | null, width = 5): string {
  if (!p || width <= 0) return ''
  const total = p.total > 0 ? p.total : 1
  const ratio = Math.max(0, Math.min(1, p.done / total))
  // Round so a nearly-complete list shows at least one filled cell rather than
  // a misleading all-empty bar.
  let filled = Math.round(ratio * width)
  if (p.done > 0 && filled === 0) filled = 1
  if (p.done < total && filled === width) filled = width - 1
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}
