// N7: ACCOUNTING for swallowed exceptions instead of silent `catch {}`.
//
// The browser classes have ~180 empty catches (a selector probe, a best-effort
// cleanup, an optional DOM read). When a site redesign breaks a selector, such
// a catch turns the failure into silence: the UI health probe is clean, yet the
// answer never appears. This helper records the failure by TAG (always) and
// prints it only in debug mode, so the counters can be surfaced by /doctor and
// the send telemetry without flooding the terminal.
//
// A genuinely expected empty catch (best-effort cleanup, an absent optional
// element) keeps `swallowSilently()` with a WHY comment — the point is that
// silence becomes an EXPLICIT choice, not the default.

export interface SwallowCounts {
  /** tag -> number of swallowed failures in this process. */
  counts: Map<string, number>
}

const counts = new Map<string, number>()

/** Record a swallowed failure. `detail` is only used in debug mode. */
export function noteSwallowed(tag: string, err?: unknown, debug = false): void {
  counts.set(tag, (counts.get(tag) ?? 0) + 1)
  if (debug) {
    const msg = err instanceof Error ? err.message : String(err ?? '')
    console.error('[swallowed] ' + tag + (msg ? ': ' + msg : ''))
  }
}

/**
 * Run `fn`, swallowing (and counting) any error under `tag`.
 * Returns `fallback` when it failed, so the caller keeps its happy path.
 */
export async function swallow<T>(
  tag: string,
  fn: () => Promise<T> | T,
  fallback: T,
  debug = false,
): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    noteSwallowed(tag, e, debug)
    return fallback
  }
}

/** The swallowed-failure counters, sorted by count (for /doctor). */
export function swallowedReport(
  limit = 5,
): Array<{ tag: string; count: number }> {
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}

/** Reset the counters (tests and a fresh session). */
export function resetSwallowed(): void {
  counts.clear()
}
