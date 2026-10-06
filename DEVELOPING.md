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
