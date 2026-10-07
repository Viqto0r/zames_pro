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

`npm run changelog:draft [ref]` builds a draft `[Unreleased]` section from the
conventional commits since the last tag (or the given `ref`). It PRINTS the
draft — it never rewrites `CHANGELOG.md`, because the changelog is a deliberate
document, not a commit-log byproduct. The pure logic lives in
`src/changelog.ts` (`parseConventionalCommit` / `groupCommits` /
`renderChangelogDraft`, unit-tested); `types`/`chore`/`ci`/`test`/`docs` are
skipped, `feat`->Added, `fix`->Fixed, `perf`/`refactor`/`style`/`revert`->Changed,
`remove`->Removed, and a `!` after the type/scope appends `(BREAKING)`.

## Refactoring the big modules (BACKLOG C3)

The core modules grew large: `index.ts` ~4.5k lines, `browser.ts` ~3.3k,
`input.ts` ~2.2k, `agent-loop.ts` ~1.9k, `i18n.ts` ~1.8k. Break them up
GRADUALLY — one module per step, never a big-bang refactor.

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
```

Coverage: `npx tsx --test --experimental-test-coverage test/*.test.ts` (this is
also what CI runs).

See `CONTRIBUTING.md` for the broader contribution flow and `AGENTS.md` for the
internal module map and design notes.
