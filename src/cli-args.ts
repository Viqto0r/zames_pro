// PURE CLI argument parsing (BACKLOG C3). index.ts used to hold `args` as a
// module-level constant plus three helpers closing over it, which made the
// parsing impossible to unit-test in isolation (index.ts is the entry point and
// is not covered). `createCliArgs(argv)` binds the argv ONCE and returns the
// same three helpers, so every call site in index.ts keeps its shape
// (`getArg('--x')` / `hasFlag('--x')`) while the LOGIC is now pure and tested.
//
// Behavior is intentionally identical to the old inline helpers, including the
// quirk that a value-flag appearing WITHOUT a value returns the fallback (never
// the flag itself or the next flag).

export interface CliArgs {
  /**
   * Value of `flag` (the NEXT argv entry), or `fallback` when the flag is
   * absent OR has no following value. A following flag is NOT special-cased:
   * `--task --debug` returns `--debug` (the historical behavior).
   */
  getArg: (flag: string, fallback?: string | null) => string | null
  /** True when `flag` appears anywhere in argv. */
  hasFlag: (flag: string) => boolean
  /**
   * Non-flag arguments (the free-form task text). Skips the VALUE of every
   * flag in SKIP_VALUE_FLAGS and drops any other `--flag`.
   */
  getPositional: () => string[]
}

// Flags that consume the NEXT argv entry as their value, so the positional
// parser must skip it. Kept in sync with the getArg call sites by
// test/cli-flags.test.ts.
export const SKIP_VALUE_FLAGS = [
  '--dir',
  '--task',
  '--max-iter',
  '--chat',
  '--output-format',
]

export function createCliArgs(argv: string[]): CliArgs {
  const args = Array.isArray(argv) ? argv : []

  const getArg = (
    flag: string,
    fallback: string | null = null,
  ): string | null => {
    const i = args.indexOf(flag)
    // `args[i + 1]` truthiness means an empty string or a missing value falls
    // back — the historical behavior (an empty `--task ''` is not a task).
    // NOTE: this does NOT special-case a following FLAG, so `--task --debug`
    // returns `--debug` (the original inline helper did the same); we preserve
    // it rather than "fix" a long-standing quirk in a refactor.
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback
  }

  const hasFlag = (flag: string): boolean => args.includes(flag)

  const getPositional = (): string[] => {
    const positional: string[] = []
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (SKIP_VALUE_FLAGS.includes(a)) {
        i++
        continue
      }
      if (a.startsWith('--')) continue
      positional.push(a)
    }
    return positional
  }

  return { getArg, hasFlag, getPositional }
}
