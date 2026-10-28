// N6/N12: the SYSTEM PROMPT BUDGET.
//
// The system prompt is sent into EVERY new chat, so it silently eats the web
// chat's context window before the first task line. `test/system-prompt-size`
// pins the default size; `/doctor` and `/context` report it in KB, with a
// warning above the same threshold. One constant for all three, so a raised
// budget is a deliberate edit here with a reason, not an accident.

/** Measured ~21.9 KB for the full default tool set (subagents on). */
export const SYSTEM_PROMPT_BUDGET_BYTES = 24000

/**
 * The project-context files (AGENTS.md / MEMORY.md) load into the same
 * prompt. A single huge file is the most common reason for a blown budget, so
 * the CONTEXT budget is reported next to the prompt one.
 */
export const CONTEXT_BUDGET_BYTES = 120000

/** kB with one decimal, for a human-facing report. */
export function kb(bytes: number): string {
  return (bytes / 1024).toFixed(1) + ' KB'
}

/** True when the size is above the budget (a WARN in /doctor). */
export function overBudget(bytes: number, budget: number): boolean {
  return bytes > budget
}
