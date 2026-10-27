// Post-edit "is it really complete?" nudge.
//
// Why: the model can generate an INCOMPLETE artifact and declare the task
// done. A live case: Qwen wrote `snake.html` with a scene, a camera and a
// board but WITHOUT the game loop, movement/food logic or key handlers, then
// said DONE — the page rendered black. That is model behaviour, but the loop
// can help: if code files were WRITTEN/EDITED in this task and the model is
// about to finish WITHOUT having run a single command (Bash) since the last
// edit, it never verified that the artifact is complete and runs. Nudge it
// ONCE to check (not to block), mirroring the structural guards: a plain
// "please verify" line the model can answer with a tool call or a confirmed
// respond.
//
// Kept PURE and narrow on purpose: no filesystem access, no word matching of
// the answer — only the STRUCTURE of the run (which tools ran, in what order).

export interface RunStep {
  tool: string
  /** Whether the call MUTATED the working tree (Write/Edit/MultiEdit/ApplyPatch). */
  mutating: boolean
  /** For a mutating call: the path it touched, when the call carries one. */
  path?: string
}

// Extensions whose result is an executable artifact: a page, a script, a
// module. Markdown/json/config edits are NOT here — "does it run" makes no
// sense for them, and nudging on every README edit would be noise.
const RUNNABLE_EXT = new Set([
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.sh',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.php',
  '.css',
])

export function isRunnablePath(p: string | undefined): boolean {
  if (!p) return false
  const lower = p.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return RUNNABLE_EXT.has(lower.slice(dot))
}

/**
 * True when the model is about to finish after WRITING/EDITING a runnable
 * code file and has run NO Bash since that last edit — i.e. nothing verified
 * that the artifact is complete and actually runs.
 *
 * `steps` is the ordered history of tool calls in this task.
 */
export function needsCompletionNudge(steps: RunStep[]): boolean {
  let lastEditIndex = -1
  let lastEditRunnable = false
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (s.mutating && isRunnablePath(s.path)) {
      lastEditIndex = i
      lastEditRunnable = true
    }
  }
  if (lastEditIndex < 0 || !lastEditRunnable) return false
  // A Bash/verification run AFTER the last code edit counts as a check.
  for (let i = lastEditIndex + 1; i < steps.length; i++) {
    if (steps[i].tool === 'Bash') return false
  }
  return true
}

export const COMPLETION_NUDGE =
  'Before finishing: you wrote/edited a runnable code file in this task, but ' +
  'you have not run any command since that edit. Check that the file is ' +
  'COMPLETE and actually runs (e.g. syntax-check it, open/parse it, run its ' +
  'tests or start it briefly) with one Bash call. If it is already verified ' +
  'another way, or the task is genuinely done, call respond with the final ' +
  'message.'
