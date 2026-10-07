# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Ctrl+Delete / Ctrl+Backspace (и Alt+Delete / Alt+Backspace) теперь удаляют
  слово в строке ввода. Раньше эти escape-последовательности попадали в
  общий пропуск клавиш и ничего не делали. Поддержаны варианты: `ESC[3;5~`
  (xterm Ctrl+Delete), `ESC[3;3~` (Alt+Delete), `ESC DEL`/`ESC 8`
  (Alt/Ctrl+Backspace) и kitty-протокол `ESC[127;5u` / `ESC[127;3u`.
  Новый метод `_deleteWordRight()` + тест `test/editor-word-delete.test.ts`.
- Меню `/config` теперь держит ВЫБРАННЫЙ пункт на экране: окно строится
  «назад» от курсора с учётом строк, которые занимают заголовки групп
  (раньше индексный `scrollTop` мог вытолкнуть выбранную строку вниз за
  пределы окна).
- `/new` сбрасывает счётчик контекста: `_lastTokenUsage` копится НА ЧАТ,
  и без сброса в пустом чате оставался старый `ctx: 302k · 30%` до первой
  отправки. Тест в `test/newchat-verify.test.ts`.

## [2.65.0] - 2026-10-07

### Changed

- README-скриншот `docs/demo.png` перегенерирован на английском языке
  (раньше был на русском). Воспроизводимый генератор
  `npm run render-demo` (`scripts/render-demo.mjs`) рендерит реальную
  раскладку редактора и палитру темы через headless Chromium с
  изолированным профилем.
- README: ASCII-схема «как это работает» заменена на диаграмму Mermaid
  (стрелки не «плывут») плюс текстовое описание словами.
- Убраны неиспользуемые файлы: `logo.jpg` (в README используется только
  `logo-small.jpg`) и заготовка `docs/demo.tape` (VHS-рендер так и не был
  сгенерирован). `logo.jpg` удалён и из списка `files` в package.json.

### Fixed

- Перерисовка терминала после ресайза окна: относительный стирающий
  `ESC[n A` после изменения размера попадал на устаревшую строку (терминал
  переформатировал переносы), из-за чего статус/инпут рисовались не там.
  Теперь после ресайза блок заново «прибивается» к низу (home + padding),
  история скроллбэка сохраняется. Тест в `test/terminal-drift.test.ts`.
- Живая смена языка (`/config lang`) не доходила до двух «одноразово
  созданных» объектов: спиннер думающих фраз брал язык по умолчанию
  (`randomThinkingPhrase()` вместо `randomThinkingPhrase(this.locale)`),
  а `DeepSeekBrowser` печатал свои уведомления (`ds.*`) на языке,
  зафиксированном при старте. Из-за этого при английском UI всплывали
  русские «Структурирую мысли…» и «⏳ DeepSeek оборвал ответ…». Добавлен
  `DeepSeekBrowser.setLocale()`, вызываемый из `setConfigRuntime`.
- Меню `/config` теперь рисуется ОКНОМ по высоте терминала (раньше весь
  список из 49 полей выводился одним блоком). На невысоком терминале блок
  уходил верхними строками за экран, из-за чего восстановление курсора
  `ESC[lastRows A` попадало не на ту строку и навигация стрелками «не
  скроллила» список. Заодно исправлена мёртвая регулярка снятия ANSI
  (лишний обратный апостроф) в `src/config-menu.ts`.

## [2.64.1] - 2026-10-07

### Changed

- README: добавлен скриншот терминальной сессии (`docs/demo.png`) под
  шапкой, чтобы интерфейс был виден сразу; скрипт воспроизводимого
  VHS-демо (`docs/demo.tape`) для будущего GIF.

## [2.64.0] - 2026-10-06

### Added

- Генератор черновика CHANGELOG из conventional-commits (BACKLOG D2):
  `npm run changelog:draft [ref]` печатает готовый блок для «Unreleased» из
  коммитов после последнего тега (или указанного ref). Чистый модуль
  `src/changelog.ts` (`parseConventionalCommit` / `groupCommits` /
  `renderChangelogDraft`, покрыт тестами). Файл `CHANGELOG.md` НЕ
  перезаписывается автоматически — черновик ревьюится вручную.

### Changed

- Рефакторинг (BACKLOG C3, шаг 1): разрешение путей вложения и инлайн
  `@file`-ссылок вынесены из `src/index.ts` в `src/attach-refs.ts`
  (`resolveAttachPath` / `inlineAtRefs`) — теперь это отдельный тестируемый
  модуль.

## [2.63.1] - 2026-10-06

### Fixed

- Мигание таймера в статусе паузы перед отправкой: `sendPause()` (и
  `LineEditor`, и non-TTY `SpinnerUI`) перерисовывал статус БЕЗ хвоста
  «elapsed»/бейджа задач, а тик анимации рисовал его С ним — раз в секунду
  подпись `· 1m 50s` исчезала и появлялась. Теперь обновление собирает тот же
  хвост, что и тик. Регрессионный тест в test/compact-statusline.test.ts.

### Changed

- README: центрированная шапка, логотип крупнее (640px-ассет, 430px показ),
  диаграмма «How it works», оглавление и секция Links.
- Dependabot: мажорные обновления игнорируются (`semver-major`), расписание
  раз в месяц, авто-мерж только для patch/minor и только для PR бота
  (проверка автора и ветки); workflow авто-мержа. Ветка `master` защищена
  ruleset: PR обязателен, required-check — стабильный job `ci`.

## [2.63.0] - 2026-10-06

### Added

- Реальные подтверждения действий (BACKLOG C1): политика approval в
  `.zames/permissions.json` (`default` + `rules` с regexp по `tool`/`command`/
  `path` и действием `allow`|`deny`|`ask`). Вызывается в `agent-loop.ts` ПЕРЕД
  каждым инструментом: `deny` блокирует вызов, `ask` спрашивает оператора через
  `onAskPermission` (в TTY — интерактивный промпт над инпут-линией, в non-TTY —
  запрет). Новый чистый модуль `src/permissions.ts` + тесты
  (test/permissions.test.ts, test/permissions-loop.test.ts).

- Кастомные команды: аргументы и подсказки (BACKLOG B7). Frontmatter
  `argument-hint:` показывается в списке «/» и в `/help` (не вставляется в
  строку ввода), а `arguments:` объявляет обязательные позиционные аргументы.
  В теле команды подставляются `$1 $2`, именованные `$name`, а также прежние
  `{{args}}`/`$ARGUMENTS`. Если обязательные аргументы не переданы — команда
  не уходит в чат, печатается подсказка. Новые чистые хелперы
  `splitCommandArgs()` / `expandCommandArgs()` / `missingCommandArgs()`
  (src/commands.ts, покрыты тестами).

- Path-scoped правила (BACKLOG B6): вложенные `AGENTS.md`/`MEMORY.md` из
  подпапок, которых касается задача, подтягиваются автоматически. Текст задачи
  сканируется на path-токены, для найденных директорий (и их предков ниже
  рабочей) читаются ближайшие инструкции и рендерятся отдельной секцией
  `## Scoped instructions (...)` — явно помечены как действующие только для
  этих файлов. `loadProjectContext(workdir, touchPaths?)` и
  `renderContextSection()` (src/context.ts, src/system-prompt.ts; покрыто
  тестами).

- `@file`-ссылки в задаче (BACKLOG B5): `реши задачу @src/browser.ts`
  подставляет содержимое указанного файла прямо в задачу, экономя отдельный
  ход агента на чтение. Распознаётся `@path` на границе слова (в начале строки
  или после пробела/скобки/кавычки), с расширением файла; `user@host` и
  декораторы (`@Component`) не трогаются. Существующие файлы инлайнятся
  (лимит 60 КБ на файл, 200 КБ суммарно — сверх этого усечение с пометкой),
  несуществующие остаются как есть. Хелпер `extractAtFileRefs()` в
  `src/path-token.ts` (чистый, покрыт тестами).

### Changed

- `AGENTS.md` уменьшен (BACKLOG C2): глубокие root-cause разборы («агент
  остановился», чтение ответа из DOM, send-хуки, `LineEditor`, вложения) и
  терминальная механика вынесены в `docs/DESIGN-NOTES.md` (progressive
  disclosure — не грузится в каждую задачу). В AGENTS.md остались действующие
  правила и краткая выжимка со ссылкой.

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
