# `/loop` prompts — the copy-paste entry points

Every improvement cycle of zames_pro is an UNATTENDED `/loop` run driven by a
protocol file. This page is the index: the protocol, the `/loop` command, and
the local shortcut the operator has in `.zames/commands/`.

The shortcuts are REAL zames custom commands, so in this project the operator
types `/<name>` instead of pasting a long line:

| Shortcut           | What it starts                                | The prompt it sends                              |
| ------------------ | --------------------------------------------- | ------------------------------------------------ |
| `/bughunt [5m]`    | a bug hunt in the CODE (`docs/BUGHUNT.md`)    | `/loop <interval> Bug hunt, one step. …`         |
| `/textaudit [5m]`  | a text audit (`docs/TEXT-AUDIT.md`)           | `/loop <interval> Text audit, one step. …`       |
| `/coverage [5m]`   | filling test-coverage gaps (no protocol file) | `/loop <interval> Coverage step, one step: …`    |
| `/dumps [5m]`      | triaging the dev dumps of unparsed calls      | `/loop <interval> Unparsed-dump step, one step:` |
| `/backlog [5m]`    | implementing the next `BACKLOG.md` item       | `/loop <interval> Backlog step, one item: …`     |
| `/smoke [5m] [id]` | a live provider smoke (`self`/`qwen`/`glm`)   | `/loop <interval> Live smoke step …`             |

The command bodies live in `.zames/commands/*.md` (gitignored — they are the
operator's local setup). The same text is below, so a fresh checkout can paste
it by hand.

## The interval — 5m, not 20m

`/loop` has a floor of 15 SECONDS (`MIN_LOOP_MS` in `src/index.ts`): a faster
loop would only hammer the send throttle. The interval is NOT the length of a
step — a step with a full `npm test` takes ~35s, so a fired tick usually lands
while the previous step is still running. The scheduler handles that: a job
whose task is already QUEUED is skipped for this tick (never two copies), and
a fired job is queued and starts the moment the agent is idle.

So a SHORT interval is safe and is the better default: it removes the dead
time between the end of one step and the next tick. `5m` is the operator's
choice; `20m` was too slow (the agent sat idle). Do not go below `5m` — a step
that ends early would then catch up on a burst of ticks.

## The prompts (paste as-is)

### Bug hunt — `docs/BUGHUNT.md`

```
/loop 5m Bug hunt, one step. Read docs/BUGHUNT.md and follow it exactly: pick the next NOT-yet-covered module from its scope table (skip the ones under "Покрытые области" in QUEUE.md unless their code changed after the covering date), find ONE real reproducible defect, write the FAILING test first (RED), fix the root cause (GREEN), run the gates (typecheck, test, lint, format:check, build), append a `### Такт N` entry to QUEUE.md with the proof + test + gates + commit SHA, update "Покрытые области", commit (fix:/test: subject) and push to master (git push origin master). Do NOT bump the version. If the module is clean, add it to "Покрытые области", write a `чисто` entry with what you verified, and commit nothing. Stop the loop with /jobs clear when every module in the scope table is covered and no covered module has changed since its covering date.
```

### Text audit — `docs/TEXT-AUDIT.md`

```
/loop 5m Text audit, one step. Read docs/TEXT-AUDIT.md and follow it exactly: pick the next NOT-yet-covered file from its scope table (skip the ones listed under "Covered areas" in QUEUE.md), audit it against the code as the source of truth, fix ONE defect family in the source file(s) plus both languages, regenerate the generated files, run the gates (typecheck, test, lint, format:check, build), append a `### Text-audit step N` entry to QUEUE.md with the finding + gates + commit SHA, update the "Covered areas" list, commit (docs:/fix: subject) and push to master (git push origin master). Do NOT bump the version. If the file is clean, add it to "Covered areas", write a `чисто` entry with what you verified, and commit nothing. Stop the loop with /jobs clear when every file in the scope table is covered.
```

### Coverage — no protocol file, the gate is the spec

```
/loop 5m Coverage step, one step: run `npm run coverage:gate`, find the module or branch whose line coverage is lowest or has NO test file at all (list `src/*.ts` without a matching `test/*.test.ts`), pick ONE of them, and write pure unit tests that pin the CURRENT behaviour — do not change the source unless a test uncovers a real bug (then switch to a fix: commit and cite docs/BUGHUNT.md). Run the gates (typecheck, test, lint, format:check, build, coverage:gate), append a `### Coverage step N` entry to QUEUE.md with the module, the covered lines/branches and the commit SHA, commit (test(scope): subject) and push to master (git push origin master). Do NOT bump the version. Stop the loop with /jobs clear when every source module has a test file and no gate module is below its floor.
```

### Unparsed dumps — the model wrote a call the parser missed

```
/loop 5m Unparsed-dump step, one step: list `.zames/unparsed/*.txt` (dev dumps of answers that looked like a tool call but were NOT parsed) and `~/.zames/net-log` if ZAMES_NET_DEBUG was on; take the NEWEST dump not yet analysed in QUEUE.md, classify WHY parseToolCall (src/answer-parse.ts) and the XML/DSML path (src/xml-toolcall.ts) missed it, then either extend the parser with a failing test FIRST (test/answer-parse*.test.ts or test/xml-toolcall*.test.ts) or record in QUEUE.md that the answer is genuinely unparseable (a reasoning paragraph, not a call) and why. Run the gates (typecheck, test, lint, format:check, build), append a `### Dump step N` entry to QUEUE.md with the dump name + verdict + commit SHA, commit (fix(parse): subject) and push to master (git push origin master). Do NOT bump the version and do NOT delete a dump you have not classified. Stop the loop with /jobs clear when every dump in the directory is classified.
```

The dump directory keeps only the newest 20 files (`rotateUnparsedDumps`), so
this queue cannot grow forever — a dump that disappears unclassified is
already lost, which is why a NEW dump is worth a step before it is rotated
out.

### Backlog — implement what was written down, do not re-invent it

```
/loop 5m Backlog step, one item: read BACKLOG.md, take the highest-priority item that is NOT archived in a <details> block and is small enough for one step, implement it (a failing test first when the item is testable), run the gates (typecheck, test, lint, format:check, build), append a `### Backlog step N` entry to QUEUE.md with the item text + what was done + commit SHA, move the item under the archived <details> block via the /backlog helpers, commit (feat(scope): or fix(scope): subject from the item) and push to master (git push origin master). Do NOT bump the version. Skip an item that needs the operator's decision and note WHY in QUEUE.md. Stop the loop with /jobs clear when BACKLOG.md has no open item left.
```

### Live smoke — the only check that sees the real chat UI

```
/loop 5m Live smoke step (provider: deepseek), one step: run the matching smoke script (`npm run self-smoke` for deepseek, `npm run qwen-smoke`, `npm run glm-smoke -- --headed`); it launches an ISOLATED zames instance (throwaway HOME) and must NEVER touch the operator's ~/.zames/profile or another agent's browser. If a scenario FAILS, read its output, reproduce the failing unit-level behaviour with a focused test if possible, fix the root cause (src/browser*.ts / src/qwen-*.ts / src/glm-*.ts / src/*-net-capture.ts), rerun the smoke and the gates (typecheck, test, lint, format:check, build), append a `### Smoke step N` entry to QUEUE.md with the scenario + failure + fix + commit SHA, commit (fix(provider): subject) and push to master (git push origin master). Do NOT bump the version. If every scenario PASSES, write a `чисто` entry with the exit code and commit nothing. Stop the loop with /jobs clear after 3 consecutive PASS runs with no new failure.
```

## What NOT to run as a loop

- **`/review`** — it reads the whole diff each tick; the diff is empty between
  commits, so every other tick is a no-op.
- **`/improve`** — it edits `BACKLOG.md` from the model's own opinion; run it
  ONCE in a while, not on a timer (the backlog step above executes what is
  already there).
- **`/self-review`** — it snapshots `src/` for its own diff; a loop of it only
  grows `~/.zames`.
- **`npm run release`** — releases are a deliberate operator action
  (DEVELOPING.md); no loop may bump the version.

## The shared journal

All cycles write into ONE gitignored file, `QUEUE.md`: "Покрытые области" (what
is already checked, so a step does not repeat it) plus the last few step
entries. Each protocol appends its own heading (`### Такт N`, `### Text-audit
step N`, `### Coverage step N`, `### Dump step N`, `### Backlog step N`,
`### Smoke step N`). Keep it under ~2000 lines — the history is in git and
`CHANGELOG.md`, not in the journal.
