---
name: verification-before-completion
description: Use BEFORE declaring a task done or reporting success — a feature, a bug fix, a file you generated. Forces you to run the verification you promised instead of trusting that the code looks right.
---

# Verification before completion

"It should work" is not done. Before you report success, produce EVIDENCE
from the real artifact — not from your intent.

## The checklist

1. **Re-read the original request.** Every requirement, including the small
   ones in a parenthetical. List them; tick each one against something you
   can show.
2. **Run the thing.** For code: build/typecheck/tests. For a script: run it.
   For a generated file: open/parse it and confirm it is complete, not
   truncated. For a UI: the real screen, not the diff.
3. **Check the WHOLE file.** A generated file (HTML/JSON/config) is a common
   silent failure: the head is there, the body/tail is missing or a
   placeholder. Confirm the closing structure exists and the file runs.
4. **Re-read your own diff** as a reviewer: leftover debug output, dead code,
   a commented-out block, a wrong path, a test that asserts nothing.
5. **State the evidence** in the final report — the exact command and its
   result — so the operator can reproduce it. "Tests pass" without the
   command is not evidence.
6. **In zames the report is ONE `respond` call.** A long task may have
   produced several findings along the way; the operator only ever reads the
   LAST `respond` before the run stops, so put the complete evidence there —
   never split it across intermediate messages, and never end a turn on a
   bare text update with work still pending.

## The two failure modes this prevents

- **Partial delivery**: a game file with a scene but no game loop; a handler
  that handles one case; a migration that covers one table. The operator runs
  it, it is broken, and trust drops.
- **Phantom fix**: the code changed, but the original reproduction was never
  re-run, so nothing proves the bug is gone.

## Rule

If you cannot run the verification (no test, no runnable entry point), SAY SO
explicitly and describe exactly what you did instead. Never report "done"
while implying a verification you did not perform.
