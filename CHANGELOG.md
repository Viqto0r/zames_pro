# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.60.0]

### Added

- PreToolUse / PostToolUse hooks (see `src/hooks.ts`): a project policy can
  attach an external script to every tool call via `.zames/hooks.json`
  (`{ "PreToolUse": [{matcher, command}], "PostToolUse": [...] }`). A
  PreToolUse hook that exits non-zero BLOCKS the call (its output becomes the
  tool result); a PostToolUse hook's stdout is appended to the result.
  Hooks are best-effort: a missing/malformed config, a crash or a 10s timeout
  never fails the agent loop.

## [2.59.0]

### Added

- `/improve [id]` — a backlog-driven self-improvement loop. It picks the
  next open item from `BACKLOG.md` (highest priority, or an explicit id),
  runs the standard task loop on it (implement, typecheck/lint/test, mark
  the item done, add a CHANGELOG entry) and leaves the changes uncommitted
  for review. This is the reproducible hand-off path for a fresh agent.

## [2.58.0]

### Added

- `--output-format json|jsonl` for one-shot runs: transcript events are
  streamed as JSON lines on stdout (human text goes to stderr), so zames
  pipes into `jq` and CI pipelines. `Transcript` gained an `onLine` mirror.
- Loop detection: four identical tool calls in a row trigger a nudge to
  change approach instead of repeating the same call forever.
- MCP configs pinned to `@latest`/`@next` now warn (in `/mcp` and at
  startup) so the tool set does not silently change between runs.
- `/help` is grouped into sections (session / workspace / git / agent /
  context / files) instead of one long list.
- `Grep` accepts a comma-separated `include` list.
- System prompt: a "Choosing the right tool" section (Edit vs MultiEdit vs
  ApplyPatch, Grep vs Glob vs LS, Git tools vs Bash).

### Changed

- `coverage-gate` enforces floors for 8 more modules and prints the
  lowest-covered modules in the CI log.
- README: Why zames?, an FAQ and a machine-readable-output section.
- Dependabot config for npm and GitHub Actions.

## [2.57.1]

### Changed

- CI workflows use actions/checkout@v5 and actions/setup-node@v5 (the v4
  actions run on the deprecated Node 20 runtime and showed up as an
  annotation on every run).

### Added

- README badges (npm version/downloads, CI status, license, Node, PRs) and a
  Features section, so the GitHub landing page and the npm page show what the
  project is at a glance.
- Community files: issue forms (bug report, feature request), a PR template
  and CODE_OF_CONDUCT.md.
- package.json: a fuller description and more keywords (npm search), and
  CHANGELOG.md is now included in the published files.

## [2.57.0]

### Added

- Plan mode (read-only): start with --plan or toggle with /plan [on|off].
  In this mode mutating tools (Write/Edit/MultiEdit/ApplyPatch/Bash, GitAdd/
  GitCommit/GitPush) are removed from the tool set entirely, so the agent can
  investigate without touching the tree.
- src/fsutil.ts - one shared atomic writer (writeFileAtomic/writeJsonAtomic).

### Changed

- config, sessions and undo now share the single atomic writer (the
  temp-file+rename logic used to be copy-pasted in three places).

### Fixed

- BACKLOG.md is now git-ignored and untracked: it is the agent's own
  improvement-notes file, rewritten constantly, and used to be published with
  the package.
- GitPush validates the branch name before building the shell command, so a
  model-supplied branch cannot smuggle shell metacharacters.
- SECURITY.md no longer promises a /permissions command / alwaysConfirm list
  that was removed in 2.55.0; AGENTS.md cleaned of the same dead refs.

## [2.56.0]

### Added

- `/context` — show what is loaded into the prompt (AGENTS.md, MEMORY.md,
  skills, custom commands) plus the system-prompt size.
- `/retry` — resend the last task into the same chat (handy after a truncated
  or empty answer).
- `/rename <title>` — set the current session title (shown in `/sessions`).
- `/diffstat` — a one-line `git diff --stat` change summary.
- `/copy` — copy the last assistant answer to the OS clipboard (wl-copy /
  xclip / xsel / pbcopy / clip).
- `GitShow` and `GitBranchList` git tools (read-only).
- The status line now shows the elapsed time of the current phase ("45s",
  "2m 05s") in BOTH the LineEditor and the non-TTY spinner, and the spinner
  shows the same "tasks: 2/5" badge the editor does.
- A one-time hint when the context reaches ~80% while auto-compact is off,
  pointing at `/compact`.
- Tests: dead-i18n-key guard, agent-facing-no-Cyrillic guard, CLI flag
  consistency, binary content-type handling for `WebFetch`.

### Changed

- `WebFetch` returns a short human note for binary content types (PDF, images,
  archives, ...) instead of dumping raw bytes into the model context.
- `npm run build` now wipes `dist/` first (`scripts/clean-dist.mjs`), so a
  removed source file no longer leaves an orphan `.js` in the package.

### Fixed

- `/undo` failure reasons are localized: `src/undo.ts` returned hardcoded
  Russian strings that showed up in an English UI. It now returns machine codes
  ('empty' / 'disabled') localized by the caller.
- Removed the dead `--project` flag (it only swallowed the following argument)
  and the no-op `--calibrate` flag together with their help/i18n entries.
- Removed the orphaned `confirm.hint` / `confirm.ask_label` i18n keys left by
  the confirm-subsystem removal.
- README Node requirement aligned with `engines` / `.nvmrc` (>= 20).
- `GitBranchList` quotes its `--format` argument so the POSIX shell does not
  choke on the parentheses/brackets in the format string.

## [2.55.0]

### Added

- `!command` in the prompt runs a shell command directly, bypassing the model
  (like Claude Code's bash mode). The same sandbox guard as the `Bash` tool
  applies, so a direct command cannot leave the project.
- `/remember <text>` appends a durable note to the project `MEMORY.md`, so a
  fact worth keeping across sessions is written to disk instead of living only
  in the chat.
- `/skills`, `/memory`, `/remember`, `/init` and `/mcp` are now listed in the
  `/help` output (they were only in the «/» completion list before).

### Changed

- The shell runner moved to `src/shell.ts`, shared by the `Bash` tool and the
  new `!command` escape (one sandbox guard, one abort wiring).
- `/self-review` now copies root configs (`package.json`, `eslint.config.js`,
  `tsconfig*.json`, `.prettierrc`) and `scripts/**` into a read-only `_context/`
  folder of the snapshot, so the reviewer can read them. The editable set
  (diff/apply) stays `.ts`-only.
- `package.json` gained `packageManager: npm@11.19.0`.

### Fixed

- The status line no longer prefixes a running-tool indicator with the
  previous answer's "done" phase (e.g. `✓ done: running Bash`): `toolCall()`
  clears the send-phase state before starting the tool animation.

### Removed

- The never-wired tool-confirmation subsystem: `src/confirm.ts`
  (`ConfirmManager`/`formatDiffPreview`) was fully implemented and tested but
  never called by the runtime, so `confirmation.write/edit/bash`,
  `alwaysConfirm` and the `/permissions` command did nothing. Removed the
  module, its tests, the config keys, the `/permissions` command and the
  related i18n strings.

## [2.54.0]

### Added

- New unit tests for previously uncovered modules: `diff.ts` (unified/color
  diff), `spinner.ts` (ellipsis/dots/UI surface), `confirm.ts`
  (confirmation logic + alwaysConfirm fallback) and `markdown.ts`
  (rendering of headings, lists, code, tables).

- `WebFetch` now blocks private/loopback/link-local addresses (SSRF guard,
  including cloud metadata `169.254.169.254`) and retries transient network
  errors and 5xx responses with exponential backoff.
- CI prints per-file test coverage (`node --experimental-test-coverage`) so
  untested modules are visible in the log (informational, does not fail).

### Changed

- The `pre-push` git hook no longer runs the full test suite (it was fragile
  and timed out on tag pushes); tests stay in `pre-commit` and CI.

## [2.53.1]

### Fixed

- `require('fs')` in ESM modules (`src/attachments.ts`, `src/self-review.ts`)
  threw `ReferenceError` at runtime: WSL clipboard detection always returned
  `false` and `/self-review` found no sources when run from the built `dist/`.
- Config, session and undo index writes are now atomic (temp file + rename),
  so a crash or Ctrl+C mid-write can no longer corrupt `~/.zames/config.json`
  or a saved session.

### Changed

- Removed the unused `marked` dependency (Markdown is rendered by `markdansi`).
- CI installs dependencies with `npm ci` for reproducible builds.
- The i18n test now validates the whole `CATALOG` instead of a small sample.
- Added `.nvmrc` (Node 24).

## [2.53.0]

### Added

- Session banner warns when no saved DeepSeek session exists.
- `--no-color` flag (explicit `NO_COLOR`).

[Unreleased]: https://github.com/Viqto0r/zames_pro/compare/v2.60.0...HEAD
[2.60.0]: https://github.com/Viqto0r/zames_pro/compare/v2.59.0...v2.60.0
[2.59.0]: https://github.com/Viqto0r/zames_pro/compare/v2.58.0...v2.59.0
[2.58.0]: https://github.com/Viqto0r/zames_pro/compare/v2.57.1...v2.58.0
[2.57.1]: https://github.com/Viqto0r/zames_pro/compare/v2.57.0...v2.57.1
[2.57.0]: https://github.com/Viqto0r/zames_pro/compare/v2.56.0...v2.57.0
[2.56.0]: https://github.com/Viqto0r/zames_pro/compare/v2.55.0...v2.56.0
[2.55.0]: https://github.com/Viqto0r/zames_pro/compare/v2.54.0...v2.55.0
[2.54.0]: https://github.com/Viqto0r/zames_pro/compare/v2.53.1...v2.54.0
[2.53.1]: https://github.com/Viqto0r/zames_pro/compare/v2.53.0...v2.53.1
[2.53.0]: https://github.com/Viqto0r/zames_pro/releases/tag/v2.53.0
