// The DEV-ONLY `/loop` cycles of zames_pro itself: bughunt, textaudit,
// coverage, dumps, backlog, smoke. Each command expands into ONE `/loop`
// line, so the interval lives in the scheduler (a fired tick is queued and
// skipped while the same job is still queued) and the operator never re-pastes
// a long prompt.
//
// WHY dev-only: these cycles edit BACKLOG.md/QUEUE.md, read the dev dumps and
// push to `master` — a regular npm user has none of that, and `/bughunt` on an
// arbitrary project would hunt bugs in THEIR code with OUR protocol. The list
// here and `DEV_ONLY_COMMANDS` in src/commands.ts are kept in sync by a test.

/** The cycle ids; also the command names (minus the leading slash). */
export type LoopCycleId =
  'bughunt' | 'textaudit' | 'coverage' | 'dumps' | 'backlog' | 'smoke'

export const LOOP_CYCLES: LoopCycleId[] = [
  'bughunt',
  'textaudit',
  'coverage',
  'dumps',
  'backlog',
  'smoke',
]

/** Default period of a cycle: 5m. The floor is MIN_LOOP_MS (15s). */
export const DEFAULT_LOOP_INTERVAL = '5m'

const RULES =
  'run the gates (typecheck, test, lint, format:check, build), append a step entry to QUEUE.md with the finding + gates + commit SHA, update the journal list, commit (see the subject rule below) and push to master (git push origin master), then check the release policy: git describe --tags --abbrev=0, git log <tag>..HEAD --pretty=format:%s and src/release-policy.ts decideRelease() — if it reports a READY patch/minor, run `npm run release <bump>`, push the branch AND the tag (git push && git push origin vX.Y.Z), and record the new version in QUEUE.md; a major or a BREAKING change is NEVER released by the loop, only reported. Do NOT bump the version by hand.'

const BODIES: Record<LoopCycleId, string> = {
  bughunt:
    'Bug hunt, one step. Read docs/BUGHUNT.md and follow it exactly: pick the next NOT-yet-covered module from its scope table (skip the ones under "Покрытые области" in QUEUE.md unless their code changed after the covering date), find ONE real reproducible defect, write the FAILING test first (RED), fix the root cause (GREEN), ' +
    RULES +
    ' If the module is clean, add it to "Покрытые области", write a `чисто` entry with what you verified, and commit nothing. Stop the loop with /jobs clear when every module in the scope table is covered and no covered module has changed since its covering date.',
  textaudit:
    'Text audit, one step. Read docs/TEXT-AUDIT.md and follow it exactly: pick the next NOT-yet-covered file from its scope table (skip the ones listed under "Covered areas" in QUEUE.md), audit it against the code as the source of truth, fix ONE defect family in the source file(s) plus both languages, regenerate the generated files (npm run build:readme && npm run build:llms), ' +
    RULES +
    ' If the file is clean, add it to "Covered areas", write a `чисто` entry with what you verified, and commit nothing. Stop the loop with /jobs clear when every file in the scope table is covered.',
  coverage:
    'Coverage step, one step: run `npm run coverage:gate`, find the module or branch whose line coverage is lowest or has NO test file at all (list `src/*.ts` without a matching `test/*.test.ts`), pick ONE of them, and write pure unit tests that pin the CURRENT behaviour — do not change the source unless a test uncovers a real bug (then switch to a fix: commit and cite docs/BUGHUNT.md). ' +
    RULES +
    ' Stop the loop with /jobs clear when every source module has a test file and no gate module is below its floor.',
  dumps:
    'Unparsed-dump step, one step: list `.zames/unparsed/*.txt` (dev dumps of answers that looked like a tool call but were NOT parsed) and `~/.zames/net-log` if ZAMES_NET_DEBUG was on; take the NEWEST dump not yet analysed in QUEUE.md, classify WHY parseToolCall (src/answer-parse.ts) and the XML/DSML path (src/xml-toolcall.ts) missed it, then either extend the parser with a failing test FIRST (test/answer-parse*.test.ts or test/xml-toolcall*.test.ts) or record in QUEUE.md that the answer is genuinely unparseable (a reasoning paragraph, not a call) and why. ' +
    RULES +
    ' Do NOT delete a dump you have not classified. Stop the loop with /jobs clear when every dump in the directory is classified.',
  backlog:
    'Backlog step, one item: read BACKLOG.md, take the highest-priority item that is NOT archived in a <details> block and is small enough for one step, implement it (a failing test first when the item is testable), ' +
    RULES +
    " Move the finished item under the archived <details> block with the /backlog helpers. Skip an item that needs the operator's decision and note WHY in QUEUE.md. Stop the loop with /jobs clear when BACKLOG.md has no open item left.",
  smoke:
    "Live smoke step, one step: run the matching smoke script (`npm run self-smoke` for deepseek, `npm run qwen-smoke`, `npm run glm-smoke -- --headed`); it launches an ISOLATED zames instance (throwaway HOME) and must NEVER touch the operator's ~/.zames/profile or another agent's browser. If a scenario FAILS, read its output, reproduce the failing unit-level behaviour with a focused test if possible, fix the root cause (src/browser*.ts / src/qwen-*.ts / src/glm-*.ts / src/*-net-capture.ts), rerun the smoke and " +
    RULES +
    ' If every scenario PASSES, write a `чисто` entry with the exit code and commit nothing. Stop the loop with /jobs clear after 3 consecutive PASS runs with no new failure.',
}

/** True when `id` is one of the cycles. */
export function isLoopCycle(id: string): id is LoopCycleId {
  return (LOOP_CYCLES as string[]).includes(String(id ?? '').toLowerCase())
}

/**
 * Build the ONE line a cycle sends to `/loop`. `interval` is the FIRST token
 * (the scheduler parses it), so a bare `/bughunt 10m` retunes the period.
 * Returns null for an unknown cycle.
 */
export function buildCycleLoopLine(
  id: string,
  interval = DEFAULT_LOOP_INTERVAL,
): string | null {
  const cycle = String(id ?? '').toLowerCase()
  if (!isLoopCycle(cycle)) return null
  // Collapse whitespace: a newline would split the interval off the command.
  const every = String(interval ?? '')
    .trim()
    .replace(/\s+/g, '')
  const period = every || DEFAULT_LOOP_INTERVAL
  return '/loop ' + period + ' ' + BODIES[cycle]
}
