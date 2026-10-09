# Developing zames itself

This file is for working ON zames (self-development). It is NOT user
documentation — `README.md` is for users of the package. Nothing here concerns
an operator who just installed zames to work on their own project.

The project is developed by running the agent on its own sources
(`npm run dev`), so most of this is the agent's own tooling.

## Dev mode

Dev mode is on with `--dev` or `hotReload: true` in the config; `npm run dev`
sets `--dev`. It enables:

- hot reload of the logic modules before each task (`reloadModules()`);
- the self-development slash commands (see below);
- the BACKLOG self-improvement note in the system prompt;
- the BACKLOG size warning at startup.

## Dev-only slash commands

These commands only make sense while developing zames. They are hidden from
`/help` and the «/» hints, and REJECTED by the main loop, unless dev mode is on,
so a normal package install never exposes them.

- `/improve [id]` — backlog-driven self-improvement loop: take the next open
  item from `BACKLOG.md` (or a specific id, e.g. `/improve B3`), implement it,
  run typecheck/lint/tests, mark it done and add a CHANGELOG entry. Nothing is
  committed — the changes stay in the working tree for review. After a
  successful run the finished item's archived `<details>` block is pruned.
- `/backlog <text>` — record an improvement idea in `BACKLOG.md` WITHOUT
  implementing it. Deterministic (no model round-trip): a fresh `N<n>` id under
  the matching priority section; an optional leading `P0..P3` picks the section,
  the first line becomes the title, the rest the body. `/backlog collapse`
  prunes the archived blocks.
- `/self-review [focus]` — snapshot `src/` and start a review; after this you are
  IN the snapshot.
- `/self-fix <name> [focus]` — return to an existing snapshot.
- `/self-done` — leave review mode.
- `/self-list` — list snapshots.
- `/self-diff <name>` — differences between the current `src/` and a snapshot.
- `/self-apply <name>` — apply a snapshot to `src/` (with a backup).

The single source of truth for the list is `DEV_ONLY_COMMANDS` /
`isDevOnlyCommand()` in `src/commands.ts` (pure, tested). Add a new
self-development command there; the help filter and the dispatch guard follow.

## BACKLOG.md

`BACKLOG.md` is the agent's own improvement-notes file. It is gitignored and
MUST NOT be committed.

- `/backlog <text>` records an idea (fresh `N<n>` id, placed under the
  `P0..P3` section; an optional leading `P0..P3` sets it) WITHOUT implementing
  it — deterministic, no model round-trip.
- `/improve` auto-prunes after a successful run: `collapseBacklog()` drops the
  archived `<details>` copy of a finished item but keeps its
  `### X. [x] ... done` summary line. The collapser is tolerant of an UNCLOSED
  `<details>` (a real file had one, making the whole document a single block) —
  it ends an archive at the next REAL heading, not only at `</details>`.
- In dev mode the system prompt (`selfImprovement`) lets the model append ONE
  short note itself when it spots an improvement outside the current task, and
  a startup warning fires past 500 lines / 60 KB.

The pure helpers live in `src/backlog.ts` (unit-tested in
`test/backlog-file.test.ts`); `index.ts` only reads/writes the file.

## CHANGELOG draft from commits

`npm run changelog:sync` writes the `[Unreleased]` section in `CHANGELOG.md`
from the conventional commits since the last tag, and `npm run changelog:check`
fails when the committed section is stale (a CI guard, D2).
`npm run changelog:draft [ref]` PRINTS a draft without touching the file — use
it to eyeball the wording before a sync. The sync is idempotent and only
rewrites the region between `## [Unreleased]` and the next `## [x.y.z]` heading
(group headings are normalized to `###`, the file's convention). The pure logic
lives in
`src/changelog.ts` (`parseConventionalCommit` / `groupCommits` /
`renderChangelogDraft`, unit-tested); `types`/`chore`/`ci`/`test`/`docs` are
skipped, `feat`->Added, `fix`->Fixed, `perf`/`refactor`/`style`/`revert`->Changed,
`remove`->Removed, and a `!` after the type/scope appends `(BREAKING)`.

## Refactoring the big modules (BACKLOG C3)

The core modules grew large: `index.ts` ~4.0k lines, `browser.ts` ~3.35k,
`input.ts` ~2.1k, `agent-loop.ts` ~1.9k, `commands.ts` ~1.3k. The i18n CATALOG
has already been split into `src/i18n/*.ts` (~1.7k lines total), so `i18n.ts` is
no longer a candidate. Break the rest up GRADUALLY — one module per step, never
a big-bang refactor. (Re-check the real numbers with `wc -l src/*.ts` — the
values here drift.)

Rules that keep it safe:

- **One step = one commit, always under tests.** Run `npm run typecheck`,
  `npm run lint`, `npx tsx --test test/*.test.ts` and `npm run coverage:gate`
  after every step.
- **`index.ts` is barely covered by tests.** Only extract PURE functions from
  it, and write the test FIRST, then move the code. A change with no test and
  no manual smoke is a gamble.
- **`browser.ts` is NOT hot-reloaded** and owns the live Playwright context —
  do not touch it unless a change actually requires it.
- Read `AGENTS.md` and `docs/DESIGN-NOTES.md` before moving anything: the
  WHY-comments explain hidden couplings that a naive move breaks.
- Prefer a new module + re-export over a partial move: keep the public import
  surface stable so callers do not churn.

Suggested order (safest first):

1. `i18n.ts` — split `CATALOG` into section files and merge into one object.
   Pure literal; `test/i18n.test.ts` already checks ru/en completeness.
2. `index.ts` — move remaining pure slash-command helpers into `commands.ts`.
3. `input.ts` — separate the buffer model from render/key parsing.
4. `index.ts` — `runTask`/queue/scheduler ticker → `src/run-task.ts` (risky;
   needs a manual smoke run).
5. `browser.ts` — leave alone unless necessary.

## Checks before a release

Run all of these; the git hooks run most of them on commit/push too.

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run self-smoke   # REQUIRED before a release (see below)
```

The unit tests cannot catch an integration regression (login, a send, an
attachment, the answer parsing). `npm run self-smoke` runs the REAL agent in an
ISOLATED profile against live DeepSeek and prints PASS/FAIL per scenario; it is
the only gate that exercises the whole path end to end. It needs live
credentials and a network, so it is a MANUAL pre-release step — it is NOT run in
CI. It never touches `~/.zames/profile` and can run alongside a live agent (see
`scripts/self-smoke.mts`: a throwaway `HOME` via `ZAMES_SMOKE_HOME`, an isolated
profile, a symlinked browser cache).

The default run logs in from scratch on a FRESH profile. DeepSeek's anti-bot
increasingly blocks a cold login there (captcha / rate limit), so the smoke can
fail on login for a reason unrelated to the agent. In that case run it against
a COPY of your signed-in profile (the live profile is only read, never opened):

```bash
npm run self-smoke -- --reuse-profile        # copy ~/.zames/profile read-only
npm run self-smoke -- --profile /path/to/dir # copy an explicit profile
```

Exit codes: `0` all scenarios passed, `1` a scenario failed, `2` login failed
(could not even start — the anti-bot case above).

Coverage: `npx tsx --test --experimental-test-coverage test/*.test.ts` (this is
also what CI runs).

See `CONTRIBUTING.md` for the broader contribution flow and `AGENTS.md` for the
internal module map and design notes.
