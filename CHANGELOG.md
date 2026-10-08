# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.69.0] - 2026-10-08

### Changed

- **ui:** ONE content width for every block, from a new single source of
  truth `src/width.ts`. The model answers, the echo of the operator text,
  the tool previews, the service warnings and the divider now all stop at
  the same margin (`min(ui.answerWidth, terminal - 1)`, capped at 100 by
  default). Before, answers and the divider were capped at 100 while the
  echoed operator text and warnings ran to the full terminal width — the
  mismatch looked ragged after a resize.
- **config:** `ui.answerWidth` now sets the SHARED content width (label
  updated). `0` = auto (terminal width, capped at 100).

## [2.68.1] - 2026-10-08

### Fixed

- **ui:** long service messages (send failures, rate limits) are now
  word-wrapped to the same margin as the tool previews (`cols - 1`).
  Before, they were printed at the full terminal width and the terminal
  wrapped them mid-word, so some lines ran to the edge and some stopped
  short. Applies to `LineEditor.warning()` and the non-TTY spinner.

## [2.68.0] - 2026-10-08

### Changed

- **git:** every git invocation (GitStatus/GitLog/GitBranchList/GitAdd/
  GitCommit and the `/diff`, `/diffstat`, `/doctor` helpers) now goes
  through `runGitArgs()` (`execFile` with an argument array, no shell). The
  last shell-string variant (`runGit`) is gone, so no git argument can ever
  be interpreted by a shell. `diffGitArgs()` now returns an array.
- **cleanup:** removed the dead `shellQuote` export (nothing used it after
  the move to `execFile`).
- **build:** `prepublishOnly` now runs `build:readme` before `build`, so a
  published README.md can never drift from `docs/readme.*.md`.

## [2.67.4] - 2026-10-08

### Fixed

- **readme:** `npm run build:readme` generated a `README.ru.md` again even
  though it is no longer published (removed from `files[]` in 2.67.1) and a
  test asserted it must not exist — so a local build wrote an untracked file
  and could trip the drift test. The generator now writes ONLY `README.md`.

## [2.67.3] - 2026-10-08

### Fixed

- **input:** a terminal resize no longer clears the whole viewport. The
  2.67.2 fix removed the duplicate footer by clearing the screen (`ESC[2J`),
  but that pushed the history above into the scrollback and left a blank gap
  between the input line and the text the operator was reading. The block is
  now erased with a RELATIVE move (the cursor row within the block), which
  lands on the block top row after a reflow and clears ONLY our own rows —
  the history above stays visible and in place.

## [2.67.2] - 2026-10-08

### Fixed

- **input:** a terminal resize no longer leaves a DUPLICATE of the status/
  input block on screen. After a resize the terminal re-flows the lines
  above the block, so the old code re-pinned by padding to the bottom and
  scrolled the previous copy of the block back into view. The repaint now
  clears the visible viewport (`ESC[2J`) before re-pinning; this clears the
  SCREEN, not the scrollback, so the history above is preserved.

## [2.67.1] - 2026-10-08

### Changed

- **web:** the headless renderer reuses ONE BrowserContext for every
  `WebFetch` with `render=true` (it used to build a fresh context per call);
  the page is closed after each fetch and the context in `closeWeb()`.
- **docs:** `npm run self-smoke` is now documented as a REQUIRED manual
  pre-release step in DEVELOPING.md — it is the only gate that catches an
  integration regression (login, send, attachments) and needs live creds,
  so it stays out of CI.
- **packaging:** `README.ru.md` is no longer generated or published. The
  Russian translation already lives inside README.md as a `<details>` block
  (visible on npm), and the language switcher is now an in-page `#readme-ru`
  anchor — the second ~15 KB file only duplicated it and could drift.

## [2.67.0] - 2026-10-08

### Fixed

- **tools:** Edit/MultiEdit no longer corrupt dollar patterns (`$&`, `$$`, `$1`)
  in `new_string` — the replacement now uses the functional form instead of a
  string replacer.
- **tools:** Grep and findstr are run through `execFile` with an argument
  array instead of a shell string, so a `$(...)` pattern is no longer executed
  as a command.
- **git:** GitShow/GitDiff/GitAdd/GitPush/GitCommit now use `execFile`; `ref`
  and `path` are validated (a leading `-` is rejected) — command/option
  injection through the arguments of read-only tools is closed.
- **sandbox:** file tools resolve the real path (`fs.realpath`) and reject a
  symlink pointing outside the working directory.
- **shell:** `assertCommandInsideRoot` expands `~`/`$HOME`, sees a `cd` inside
  a subshell/backticks and rejects `eval` with `cd`.
- **plan mode:** MCP tools are now filtered for read-only too (mutating verbs
  are dropped).
- **self-review:** the snapshot and diff/apply walk src/ subdirectories
  recursively (`i18n/`, `input/`) — they used to be silently missing from the
  snapshot.
- **one-shot `--task`:** on an agent error / iteration limit / watchdog the
  process now exits with code 1 instead of 0.
- **input:** Ctrl+Delete and Delete now work under the CSI-u (kitty) protocol:
  `CSI 3;5u`/`3;3u`/`3u`.
- **input:** Up/Down move the cursor across VISUAL rows of a wrapped line, not
  only across logical lines.
- **input:** a lone ESC no longer aborts the generation when a control
  sequence arrives in two chunks — a short timeout disambiguation.
- **input:** Ctrl+L clears the screen and PageUp/PageDown page the suggestion
  list; an unknown control sequence is logged in debug instead of being
  swallowed silently.
- **MCP:** duplicate tool names are disambiguated with a numeric suffix so the
  second tool is not silently unreachable.
- **MCP:** a tool result is truncated with an explicit marker — a single call
  (browser_snapshot and the like) no longer floods the context.
- **transcript:** `close()` waits for the flush (it returns a promise) so the
  final events reach the file on the exit paths.
- **web:** `WebFetch` re-validates every redirect hop against the SSRF guard
  and checks the final URL of a headless render.
- **permissions:** a `path` rule now also matches the file headers of an
  `ApplyPatch` and path-looking arguments of MCP tools.
- **scheduler:** `nextCronTime` parses the cron expression once instead of on
  every scanned minute.
- **git:** `formatGitContext` picks a code fence longer than any backtick run
  in the preview, so a filename with backticks cannot break the markdown.
- **fsutil:** secrets and state are written with 0600 permissions;
  `writeFileAtomic` fsyncs the file before rename (and the directory after)
  for durability on a power loss.

### Changed

- **docs:** SECURITY.md updated for the permissions policy, the symlink guard
  and the plan-mode MCP caveat; DEVELOPING.md module sizes refreshed.
- **cleanup:** removed the dead exports `listConfiguredServers`,
  `builtinSkills` and `findFileByName`.
- **tests:** the MCP result cap, `htmlToText` and the DuckDuckGo parser are
  now covered, and `web.ts`/`spinner.ts` gained coverage floors.

### Security

- Shared `shellQuote` helper for arguments passed to the shell (single quotes
  with internal quotes doubled).

## [2.66.1] - 2026-10-07

### Changed

- README: the Russian translation is now folded into `<details>` directly in
  `README.md`, so it can be read on the npm page without leaving GitHub. npm
  renders the readme with the same GitHub Flavored Markdown as GitHub, and a
  separate `README.ru.md` is not visible on the npm page (npm has one readme
  per package). Both language versions are assembled from
  `docs/readme.{en,ru}.md` by `npm run build:readme`;
  `test/readme-built.test.ts` guards against drift.

## [2.66.0] - 2026-10-07

### Added

- **release:** add scripts/release.mts for one-command release prep (G4)

- **reload:** include commands, run-task and attach-refs in hot-reload (G2)

### Changed

- apply prettier to files touched by G2/F1

## [2.65.1] - 2026-10-07

- Long preview lines no longer create a horizontal scrollbar in the terminal:
  `toolCall`/`toolResult` (LineEditor and spinner) now clip the preview by the
  VISIBLE terminal width (`truncateToWidth`) instead of by character count. A
  long command/result used to print wider than the screen.
- Ctrl+Delete / Ctrl+Backspace (and Alt+Delete / Alt+Backspace) now delete a
  word in the input line. These escape sequences used to fall through the
  generic key skip and did nothing. Supported variants: `ESC[3;5~` (xterm
  Ctrl+Delete), `ESC[3;3~` (Alt+Delete), `ESC DEL`/`ESC 8`
  (Alt/Ctrl+Backspace) and the kitty protocol `ESC[127;5u` / `ESC[127;3u`.
  New `_deleteWordRight()` method + `test/editor-word-delete.test.ts`.
- The `/config` menu now keeps the SELECTED item on screen: the window is
  built "backwards" from the cursor, taking into account the rows the group
  headings occupy (previously an index-based `scrollTop` could push the
  selected row below the window).
- `/new` resets the context counter: `_lastTokenUsage` accumulates PER CHAT,
  and without a reset an empty chat kept showing the old `ctx: 302k · 30%`
  until the first send. Test in `test/newchat-verify.test.ts`.

## [2.65.0] - 2026-10-07

### Changed

- The README screenshot `docs/demo.png` was regenerated in English (it used to
  be in Russian). The reproducible generator `npm run render-demo`
  (`scripts/render-demo.mjs`) renders the real editor layout and theme palette
  through headless Chromium with an isolated profile.
- README: the ASCII "how it works" diagram was replaced by a Mermaid diagram
  (the arrows no longer "float") plus a textual description in words.
- Removed unused files: `logo.jpg` (only `logo-small.jpg` is used in the
  README) and the `docs/demo.tape` draft (the VHS render was never generated).
  `logo.jpg` was also removed from the `files` list in package.json.

- Terminal repaint after a window resize: the relative erase `ESC[n A` after a
  size change landed on a stale row (the terminal re-flowed the wraps), so the
  status/input were drawn in the wrong place. After a resize the block is
  re-pinned to the bottom (home + padding), and the scrollback history is kept.
  Test in `test/terminal-drift.test.ts`.
- A live language change (`/config lang`) did not reach two "created once"
  objects: the thinking-phrase spinner took the default language
  (`randomThinkingPhrase()` instead of `randomThinkingPhrase(this.locale)`),
  and `DeepSeekBrowser` printed its notices (`ds.*`) in the language fixed at
  startup. So with an English UI Russian thinking/notice phrases surfaced.
  Added `DeepSeekBrowser.setLocale()`, called from `setConfigRuntime`.
- The `/config` menu is now drawn as a WINDOW sized to the terminal height
  (previously the whole list of 49 fields was printed as one block). On a short
  terminal the block scrolled off the top, so restoring the cursor with
  `ESC[lastRows A` landed on the wrong row and arrow navigation "did not
  scroll" the list. Also fixed a dead ANSI-strip regex (a stray backtick) in
  `src/config-menu.ts`.

## [2.64.1] - 2026-10-07

### Changed

- README: added a terminal session screenshot (`docs/demo.png`) under the
  header so the interface is visible immediately; a reproducible VHS demo
  script (`docs/demo.tape`) for a future GIF.

## [2.64.0] - 2026-10-06

### Added

- A CHANGELOG draft generator from conventional commits (BACKLOG D2):
  `npm run changelog:draft [ref]` prints a ready "Unreleased" block from the
  commits after the last tag (or the given ref). Pure module
  `src/changelog.ts` (`parseConventionalCommit` / `groupCommits` /
  `renderChangelogDraft`, unit-tested). The `CHANGELOG.md` file is NOT
  overwritten automatically — the draft is reviewed by hand.

### Changed

- Refactor (BACKLOG C3, step 1): attachment path resolution and `@file`
  reference inlining were moved out of `src/index.ts` into
  `src/attach-refs.ts` (`resolveAttachPath` / `inlineAtRefs`) — now a separate
  testable module.

## [2.63.1] - 2026-10-06

- Timer flicker in the pre-send pause status: `sendPause()` (both `LineEditor`
  and the non-TTY `SpinnerUI`) repainted the status WITHOUT the
  "elapsed"/task-badge tail, while the animation tick drew it WITH it — once a
  second the `· 1m 50s` label disappeared and reappeared. The update now builds
  the same tail as the tick. Regression test in test/compact-statusline.test.ts.

### Changed

- README: centered header, larger logo (640px asset, 430px display), a "How
  it works" diagram, a table of contents and a Links section.
- Dependabot: major updates are ignored (`semver-major`), monthly schedule,
  auto-merge only for patch/minor and only for bot PRs (author and branch
  checks); auto-merge workflow. The `master` branch is protected by a ruleset:
  PR required, required check is the stable `ci` job.

## [2.63.0] - 2026-10-06

### Added

- Real action approvals (BACKLOG C1): an approval policy in
  `.zames/permissions.json` (`default` + `rules` with regexp on
  `tool`/`command`/`path` and an `allow`|`deny`|`ask` action). Evaluated in
  `agent-loop.ts` BEFORE every tool: `deny` blocks the call, `ask` prompts the
  operator via `onAskPermission` (in a TTY — an interactive prompt above the
  input line, in non-TTY — denied). New pure module `src/permissions.ts` +
  tests (test/permissions.test.ts, test/permissions-loop.test.ts).

- Custom commands: arguments and hints (BACKLOG B7). Frontmatter
  `argument-hint:` is shown in the "/" list and in `/help` (not inserted into
  the input line), and `arguments:` declares mandatory positional arguments.
  `$1 $2`, named `$name` and the previous `{{args}}`/`$ARGUMENTS` are
  substituted into the command body. If the required arguments are missing the
  command is not sent to the chat and a hint is printed. New pure helpers
  `splitCommandArgs()` / `expandCommandArgs()` / `missingCommandArgs()`
  (src/commands.ts, unit-tested).

- Path-scoped rules (BACKLOG B6): nested `AGENTS.md`/`MEMORY.md` from the
  subdirectories the task touches are pulled in automatically. The task text is
  scanned for path tokens, the nearest instructions are read for the found
  directories (and their ancestors below the working dir) and rendered as a
  separate `## Scoped instructions (...)` section — explicitly marked as
  applying only to those files. `loadProjectContext(workdir, touchPaths?)` and
  `renderContextSection()` (src/context.ts, src/system-prompt.ts; unit-tested).

- `@file` references in a task (BACKLOG B5): `solve the task @src/browser.ts`
  inlines the contents of the referenced file right into the task, saving a
  separate agent turn to read it. `@path` is recognized at a word boundary (at
  the start of a line or after a space/bracket/quote) with a file extension;
  `user@host` and decorators (`@Component`) are not touched. Existing files are
  inlined (60 KB per file, 200 KB total — beyond that a truncation marker),
  missing ones stay as-is. Helper `extractAtFileRefs()` in `src/path-token.ts`
  (pure, unit-tested).

### Changed

- `AGENTS.md` trimmed (BACKLOG C2): the deep root-cause write-ups ("the agent
  stopped", reading the answer from the DOM, send hooks, `LineEditor`,
  attachments) and the terminal mechanics were moved to
  `docs/DESIGN-NOTES.md` (progressive disclosure — not loaded into every task).
  AGENTS.md keeps the acting rules plus a short summary with a pointer.

## [2.62.0]

### Added

- Checkpoints / rewind (BACKLOG B3): at the start of every task the working
  tree is snapshotted into a tarball under `~/.zames/checkpoints/`, and
  `/rewind [n]` rolls it back in one step (with a confirmation prompt and an
  automatic `pre-rewind` backup of the current state, so the rewind itself is
  reversible). `/rewind-list` shows the recent checkpoints. `node_modules`,
  `.git`, `dist` and `tmp` are never snapshotted or deleted. Unlike a manual
  git stash, this works in a non-git directory and never touches the
  operator's index. New module `src/checkpoint.ts` (pure helpers + `CheckpointStore`,
  unit-tested); configurable via `checkpoint.enabled` / `checkpoint.maxBackups`
  (default 50) in `/config`.

## [2.61.0]

### Added

- `/backlog <text>` — record an improvement idea in `BACKLOG.md` without
  implementing it. Deterministic: a fresh `N<n>` id under the matching
  `P0..P3` section; an optional leading `P0..P3` picks the section, the first
  line is the title, the rest the body. `/backlog collapse` prunes the
  archived blocks.
- BACKLOG.md maintenance (`src/backlog.ts`, pure/tested): `/improve` now
  auto-prunes a finished item's archived `<details>` copy after a successful
  run (the `### X. [x] ... done` summary line is kept), and a startup warning
  fires when BACKLOG.md exceeds 500 lines / 60 KB. The collapser tolerates an
  UNCLOSED `<details>` (a real file had one).
- Dev-mode self-improvement note: in `--dev` the system prompt tells the model
  it may append ONE short BACKLOG.md bullet when it spots an improvement
  outside the current task (off in a normal run).

### Changed

- Self-development commands (`/improve`, `/backlog`, `/self-review`,
  `/self-fix`, `/self-done`, `/self-list`, `/self-diff`, `/self-apply`) are now
  DEV-ONLY: they are hidden from `/help` and the «/» hints, and rejected by the
  main loop, unless the operator runs in dev mode (`--dev` or
  `config.hotReload`). A regular package install no longer advertises them, and
  a hand-typed `/improve` can no longer edit an unrelated project's
  BACKLOG.md. The list is `DEV_ONLY_COMMANDS` / `isDevOnlyCommand()` in
  `src/commands.ts` (pure, tested).

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

[Unreleased]: https://github.com/Viqto0r/zames_pro/compare/v2.64.1...HEAD
[2.64.1]: https://github.com/Viqto0r/zames_pro/compare/v2.64.0...v2.64.1
[2.64.0]: https://github.com/Viqto0r/zames_pro/compare/v2.63.1...v2.64.0
[2.63.1]: https://github.com/Viqto0r/zames_pro/compare/v2.63.0...v2.63.1
[2.63.0]: https://github.com/Viqto0r/zames_pro/compare/v2.61.0...v2.63.0
[2.61.0]: https://github.com/Viqto0r/zames_pro/compare/v2.60.0...v2.61.0
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
