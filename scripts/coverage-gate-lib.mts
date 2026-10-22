// PURE halves of the coverage gate (scripts/coverage-gate.mts), extracted so
// the PARSING and the FLOOR check are unit-tested without spawning a full test
// run. The script itself only spawns the suite, parses, and exits.

/**
 * Parse Node's per-file coverage table into `basename -> line %`.
 *
 * A test may load the SAME module through a CACHE-BUSTED import (`?fresh=…`,
 * used by test/sessions-*.test.ts to get a fresh HOME): Node then prints one
 * row PER MODULE INSTANCE, where the cache-busted row's name carries the query
 * (`sessions.ts?fresh=abc`). Keeping the FIRST match kept only the partial
 * instance — sessions.ts reported 30.86% while its real suite covered 98% — and
 * CI failed on every push. Rows are therefore keyed by the bare file name and
 * merged with the BEST instance; the gate still catches a module that lost its
 * tests in EVERY instance.
 */
export function parseCoverageRows(output: string): Map<string, number> {
  const rows = new Map<string, number>()
  for (const line of String(output || '').split(String.fromCharCode(10))) {
    // Per-file rows look like:
    //   ℹ  commands.ts      |  94.14 |  78.70 |  93.88 | 40-56 ...
    const m = line.match(
      /^\s*\S?\s*([A-Za-z0-9._-]+\.ts)(?:\?\S*)?\s+\|\s+([\d.]+)\s+\|/,
    )
    if (!m) continue
    const pct = Number(m[2])
    if (!Number.isFinite(pct)) continue
    if (!rows.has(m[1]) || pct > (rows.get(m[1]) as number)) {
      rows.set(m[1], pct)
    }
  }
  return rows
}

export interface CoverageFailure {
  file: string
  reason: string
}

export interface CoverageGateResult {
  ok: boolean
  failures: CoverageFailure[]
}

/** Compare the parsed coverage against the per-file floors. PURE. */
export function runCoverageGate(
  rows: Map<string, number>,
  floors: Record<string, number>,
): CoverageGateResult {
  const failures: CoverageFailure[] = []
  for (const [file, floor] of Object.entries(floors)) {
    const pct = rows.get(file)
    if (pct === undefined) {
      failures.push({ file, reason: 'no coverage row found' })
      continue
    }
    if (pct < floor) {
      failures.push({ file, reason: pct + '% < floor ' + floor + '%' })
    }
  }
  return { ok: failures.length === 0, failures }
}
