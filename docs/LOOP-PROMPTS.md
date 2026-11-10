# `/loop` improvement cycles — the dev-only commands

Every improvement cycle of zames_pro is an UNATTENDED `/loop` run. Since
2.96 the cycles are real zames commands, so the operator types
`/bughunt 5m` instead of pasting a long prompt.

All of them are **DEV-ONLY** (`/bughunt`, `/textaudit`, `/coverage`,
`/dumps`, `/smoke` live in `DEV_ONLY_COMMANDS`, see `src/loop-prompts.ts`):
a regular npm user never sees them in `/help` or the «/» hints and the dispatch
rejects them with `msg.dev_only`. Reason: they edit `QUEUE.md`/`BACKLOG.md`,
read the dev dumps and push to `master` — none of that exists in a user's
project, and `/bughunt` there would hunt bugs in THEIR code with OUR protocol.

## The commands

| Command           | Cycle                                       | Protocol                 |
| ----------------- | ------------------------------------------- | ------------------------ |
| `/bughunt [5m]`   | a bug hunt in the CODE                      | `docs/BUGHUNT.md`        |
| `/textaudit [5m]` | the text audit                              | `docs/TEXT-AUDIT.md`     |
| `/coverage [5m]`  | filling test-coverage gaps                  | — (the gate is the spec) |
| `/dumps [5m]`     | triaging the dev dumps of unparsed calls    | —                        |
| `/smoke [5m]`     | a live provider smoke (`self`/`qwen`/`glm`) | —                        |

`/backlog` stays what it always was (record a note) — the `backlog` CYCLE
(implementing one item from `BACKLOG.md`) has no command of its own: it lives
in `LOOP_CYCLES` (`src/loop-prompts.ts`) and is skipped by
`createDevCommands`'s registry because the plain `/backlog` command owns the
name.

Each command expands into ONE `/loop <interval> <task>` line
(`buildCycleLoopLine()` in `src/loop-prompts.ts`) and arms the scheduler
through the SAME path `/loop` uses — so the interval handling, the
"do not pile copies of the same job" rule and `/jobs` bookkeeping have one
owner. The interval is the FIRST argument and defaults to `5m`; the floor is
`MIN_LOOP_MS` (15s).

## The interval — 5m, not 20m

`/loop` only puts a job into the message queue; it never interrupts a running
turn. A step with a full `npm test` takes ~35s, so most ticks fire while the
previous step is still running — and such a tick is SKIPPED (a job whose task
is already queued is not enqueued twice). A short interval therefore only
removes the idle time between steps. `5m` is the recommended value; do not go
below `5m` because a step that finishes early would then catch up on a burst
of ticks.

## Commits and the release

Every step ends the same way: run the gates (typecheck, test, lint,
format:check, build), append its entry to `QUEUE.md`, commit with a
conventional subject and push to `master`.

**The version is bumped by the cycle too — but only when a real pile has
accumulated.** The rule is PURE and unit-tested
(`src/release-policy.ts`, `test/release-policy.test.ts`):

- user-visible commits since the last tag = the ones `CHANGELOG.md` would show
  (`feat`, `fix`, `perf`, `refactor`, `revert`, `remove`); `docs`, `chore`,
  `test`, `ci`, `build` neither count nor block;
- any `feat:` → **minor** on its own; anything else needs
  `MIN_COMMITS = 5` visible commits → **patch**;
- a `!`/BREAKING change → **major**, and the loop NEVER cuts it: it reports it
  and leaves the decision to the operator.

When the policy says READY the cycle runs `npm run release <bump>` (which
bumps `package.json` + `CITATION.cff`, writes the dated CHANGELOG section,
commits `chore: release X.Y.Z` and tags), then pushes the branch AND the tag
(`git push && git push origin vX.Y.Z`) — the tag is what triggers the npm
publish workflow. Recording the new version in `QUEUE.md` closes the step.

Why not a release per fix: DEVELOPING.md — several fixes land as ONE patch
release (a 142-patch 2.82.x branch made the CHANGELOG and npm unreadable).
Why not "never": the Unreleased section grew for weeks and `/changelog:check`
refused a push whose pile was actually ready.

## What NOT to run as a loop

- **`/review`** — it reads the whole diff each tick; the diff is empty between
  commits, so every other tick is a no-op.
- **`/improve`** — it edits `BACKLOG.md` from the model's own opinion; run it
  ONCE in a while, not on a timer. To implement ONE item on a schedule, use the
  `backlog` CYCLE from `src/loop-prompts.ts` instead (`/backlog` itself only
  records a note).
- **`/self-review`** — it snapshots `src/` for its own diff; a loop of it only
  grows `~/.zames`.
- **`npm run release`** by hand on every fix — see the policy above.

## The shared journal

All cycles write into ONE gitignored file, `QUEUE.md`: the covered-areas list
(so a step does not repeat work) plus the last few step entries. Each protocol
appends its own heading (`### Такт N`, `### Text-audit step N`,
`### Coverage step N`, `### Dump step N`, `### Smoke step N`). Keep it under
~2000 lines — the history is in git and `CHANGELOG.md`, not in the journal.
