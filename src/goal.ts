// Completion-goal semantics (Claude Code parity). A /goal sets a CONDITION
// that must be satisfied; after every turn a fresh model judges it (MET ->
// clear, IMPOSSIBLE -> clear, NOT_MET -> keep working). The PURE half -- the
// evaluator prompt and the verdict parser -- lives here so it is unit-tested
// without a browser. The `browser.ask()` call and the continuation loop live
// in run-task.ts.

export interface GoalVerdict {
  status: 'met' | 'not_met' | 'impossible'
  reason: string
}

/** Hard cap on the condition length, mirroring Claude Code's 4 000-char bound. */
export const GOAL_CONDITION_CAP = 4000

/** Default cap on how many auto-continue turns a goal may spawn. */
export const GOAL_MAX_TURNS = 25

/** Trim a goal condition to the cap. */
export function clampGoalCondition(condition: string): string {
  const g = String(condition ?? '').trim()
  if (g.length <= GOAL_CONDITION_CAP) return g
  // Never cut a surrogate PAIR in half: the condition is injected into the
  // evaluator prompt, and a lone high surrogate is a broken code point (same
  // rule as truncateToolResult / capReport / clipLine / oneLine).
  let cut = GOAL_CONDITION_CAP
  const last = g.charCodeAt(cut - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut--
  return g.slice(0, cut)
}

// The evaluator prompt is AGENT-facing (English), like the system prompt and
// the compact summary prompt. It runs in the SAME chat as the work so the
// judge sees the actual transcript (command output, file state), which is
// what Claude Code's evaluator reads too. A clean, machine-parsable verdict
// is requested; no tools.
export function buildEvaluatorPrompt(condition: string): string {
  const NL = String.fromCharCode(10)
  return (
    'You are a strict COMPLETION EVALUATOR. You do NOT do the work and you do NOT call tools. Read ' +
    'the conversation above and judge - from what the agent has ALREADY surfaced - whether ' +
    'the completion condition below is satisfied.' +
    NL +
    NL +
    'Completion condition:' +
    NL +
    condition +
    NL +
    NL +
    'Reply with EXACTLY two lines, nothing else:' +
    NL +
    'VERDICT: MET | NOT_MET | IMPOSSIBLE' +
    NL +
    'REASON: <one short sentence>' +
    NL +
    NL +
    'Rules:' +
    NL +
    '- MET only if the condition is demonstrably satisfied: evidence appears in the conversation ' +
    '(command output, test result, file state). A promise to do it later is NOT MET.' +
    NL +
    '- NOT_MET if more work is needed; state briefly what is missing.' +
    NL +
    '- IMPOSSIBLE only if the condition can never be satisfied as written.' +
    NL +
    '- Judge from the conversation only; do not run commands or read files independently.'
  )
}

// The continuation directive injected as the next turn's task when the
// evaluator says NOT_MET. Agent-facing (English). The goal itself is prepended
// again by withGoal(), so this only adds the verdict + a continue instruction.
export function buildContinuationDirective(reason: string): string {
  const NL = String.fromCharCode(10)
  return (
    'The completion goal is NOT yet met. Continue working toward it ' +
    'until it is satisfied. Do not call respond with a final summary until the ' +
    'condition is met.' +
    NL +
    (argumentReason(reason) ? 'Evaluator note: ' + reason : '')
  )
}

function argumentReason(reason: string): boolean {
  return String(reason ?? '').trim().length > 0
}

// Parse the evaluator's reply into a verdict. Tolerant of markdown emphasis
// and casing (```VErdict: MET``). Returns null when the verdict line is
// missing, so the caller can fail closed (treat an unparsable answer as
// "continue", never as "done").
export function parseGoalVerdict(text: string): GoalVerdict | null {
  const t = String(text ?? '')
  // The label may be bolded/italicised and the colon may carry surrounding
  // spaces (`**VERDICT:** MET`) — a markdown-model answer did exactly that and
  // the strict `VERDICT:` matcher returned null, so the goal never parsed and
  // the loop auto-continued until the turn budget.
  // The value itself may be written the human way (`NOT MET`, `NOT-MET`): a
  // strict `NOT_MET` matcher returned null for those, and null means "continue"
  // — the goal loop then auto-continued until the turn budget although the
  // judge had already said NOT_MET. `MET` is tried LAST so it cannot match the
  // tail of `NOT MET`.
  //
  // The evaluator sometimes ECHOES the requested label set before the real
  // verdict (`VERDICT: MET | NOT_MET | IMPOSSIBLE`). Taking the FIRST match
  // read the echo's `MET` as the verdict while REASON said the opposite, and
  // MET CLEARS the goal — an unfinished task was silently accepted as done.
  // A verdict line with a separator after the value is an echo, not a verdict;
  // scan EVERY `VERDICT:` occurrence and take the first REAL one. The
  // separator is checked on the character FOLLOWING the matched value (a
  // lookahead INSIDE the value pattern was useless: the value alternatives
  // always end on a word boundary of their own).
  const label =
    /VERDICT\s*[*_`]*\s*:\s*[*_`]*\s*(IMPOSSIBLE|NOT[_ -]?MET|MET)/gi
  let m: RegExpExecArray | null
  let status: GoalVerdict['status'] | null = null
  while ((m = label.exec(t)) !== null) {
    // Skip whitespace/backticks between the value and whatever follows.
    let k = m.index + m[0].length
    while (k < t.length && /[\s*_`]/.test(t.charAt(k))) k++
    const after = t.charAt(k)
    if (after === '|' || after === '/') continue
    const raw = m[1].toUpperCase()
    status =
      raw === 'MET' ? 'met' : raw === 'IMPOSSIBLE' ? 'impossible' : 'not_met'
    break
  }
  if (!status) return null
  const rm = /REASON\s*[*_`]*\s*:\s*(.+)/i.exec(t)
  const reason = rm
    ? rm[1]
        .replace(/`{1,3}/g, '')
        .replace(/\*{1,2}/g, '')
        .trim()
    : ''
  return { status, reason }
}
