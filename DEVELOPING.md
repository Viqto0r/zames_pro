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

## The terminal UI (Ink TUI)

The operator-facing input area is a React/Ink app under `src/tui/` (`ui.tui`,
default on). `index.ts` and `run-task.ts` never import Ink components: they
talk to the `UiEditor` interface (`src/tui/types.ts`) that BOTH the new
`TuiEditor` and the legacy `LineEditor` implement, so the rendering engine can
be swapped (`ui.tui: false` restores the old editor).

How the two worlds meet: the agent calls the UI imperatively (`printAbove`,
`toolCall`, `busy`, ...), while Ink renders from React state. `TuiStore`
(`src/tui/store.ts`) is an external store the Ink tree subscribes to with
`useSyncExternalStore`; the adapter mutates it and React re-renders. Adding a
new status element = add a field to `TuiState`, write it from `TuiEditor`, read
it in a component.

When editing the TUI:

- Keep the PURE halves pure: `edit.ts` (buffer/cursor/history/search/paste
  transitions) and `keys.ts` (Ink `(input, key)` -> action). They are unit-tested
  in `test/tui-edit.test.ts` WITHOUT a terminal — add a case there for any new
  binding.
- Reuse the existing PURE helpers, do not duplicate: `src/input/layout.ts`
  (visual rows, widths, paste markers, token status) and `src/input/suggest.ts`
  (fuzzy `/` completion).
- Ink's `useInput` normalizes escape sequences (ctrl/meta/shift/arrows/…); the
  raw CSI parsing the old editor needed is NOT required. For exotic sequences
  (Ctrl+Backspace, Alt+Delete) check whether Ink delivers them; if not, handle
  them in `InputLine`'s `useInput`, not in `keys.ts`.
- `src/tui/*.tsx` compiles via `tsc`'s `react-jsx` transform (`jsx: react-jsx`
  in `tsconfig.json`), so `npm run build` emits `.js` for them. `tsconfig.json`
  and `tsconfig.build.json` include `src/**/*.tsx`.
- Ink 8 requires Node >= 22 (the `engines` field was bumped accordingly).
- Verify visually: run `npm run dev` (HEADED) or the pty smoke pattern — a
  `script -qec "npx tsx <script>" /dev/null` wrapper gives a real TTY, and
  writing keys one at a time to the child's stdin drives `useInput` (a whole
  chunk is treated as a PASTE).

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

### The other working notes (gitignored)

Three more local files are SCRATCHPADS, not documentation — they are gitignored
and never shipped, so a release cannot carry them:

| File | What it is | Who updates it |
| --- | --- | --- |
| `BACKLOG.md` | improvement ideas for the agent itself | `/backlog`, `/improve`, the model in dev mode |
| `QUEUE.md` | the text-audit queue + journal (`docs/TEXT-AUDIT.md` protocol) | a `/loop` audit run |
| `scripts/dev-probes/` | one-off TUI pty probes, written by the AGENT per bug | the agent (the file is gitignored) |

They exist so a long-running improvement cycle does not lose its place. If one
of them grows past a screenful of stale entries, delete it — the history is in
git and CHANGELOG.md.

### Documentation that IS shipped

- `docs/readme.{en,ru}.md` — the two README sources; `README.md` is generated
  from them (`npm run build:readme`).
- `docs/llms.txt` — the SOURCE of the short LLM map; `npm run build:llms`
  copies it to the repository root (`llms.txt`) and writes `llms-full.txt`.
  Root copies are what crawlers and the npm package read.
- `docs/SEO.md` — how the project is made findable (metadata surfaces).
- `docs/TEXT-AUDIT.md` — the protocol for the text audit; `QUEUE.md` is its
  gitignored journal.
- `docs/DESIGN-NOTES.md` — deep root-cause write-ups (read on demand).
- `docs/shots/` — one screenshot per palette, written by
  `npm run ui-smoke -- --shots`; the README hero image is the separate
  `docs/demo.png` (the operator's own capture, NOT regenerated by the agent).

## CHANGELOG draft from commits

`npm run changelog:sync` writes the `[Unreleased]` section in `CHANGELOG.md`
from the conventional commits since the last tag, and `npm run changelog:check`
fails when the committed section is stale. It is a LOCAL guard, not a CI one:
`.github/workflows/test.yml` runs lint, format:check, typecheck, the tests with
coverage, the coverage gate and the build — no changelog step — so run it
yourself before a release.
`npm run changelog:draft [ref]` PRINTS a draft without touching the file — use
it to eyeball the wording before a sync. The sync is idempotent and only
rewrites the region between `## [Unreleased]` and the next `## [x.y.z]` heading
(group headings are normalized to `###`, the file's convention). The pure logic
lives in
`src/changelog.ts` (`parseConventionalCommit` / `groupCommits` /
`renderChangelogDraft`, unit-tested); `types`/`chore`/`ci`/`test`/`docs` are
skipped, `feat`->Added, `fix`->Fixed, `perf`/`refactor`/`style`/`revert`->Changed,
`remove`->Removed, and a `!` after the type/scope appends `(BREAKING)`.

## Refactoring the big modules

The core modules grew large: `index.ts` ~4.9k lines, `browser.ts` ~3.3k,
`input.ts` ~2.2k, `commands.ts` ~1.6k, `agent-loop.ts` ~1.6k. The i18n CATALOG
has already been split into `src/i18n/*.ts` (~2.6k lines), so `i18n.ts` is
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

## Multiple providers (DeepSeek, Qwen, …)

zames drives more than one chat backend. The provider boundary is the
`ChatProvider` interface (`src/types.ts`); everything above the browser (agent
loop, tools, answer parser, system-prompt, sessions) depends only on
`BrowserLike` and is provider-agnostic.

The **registry** (`src/providers.ts`) is the SINGLE source of truth: provider
ids, human labels, the `/chat` URL prefix. The config enum, `/provider`
validation, the `{provider}` label in operator messages, the `/doctor` row and
`/chat` all read from it, so adding a backend touches ONE data file plus the
provider's own modules — not a dozen ternaries.

### Adding a provider (ChatGPT, Gemini, …)

1. Add an entry to `PROVIDERS` in `src/providers.ts` (id, label,
   `chatUrlPrefix`, `isDefault`). The config enum, `/provider` and the rest
   pick it up automatically (see `test/providers.test.ts`).
2. Add `<name>-ui.ts` (selectors), `<name>-net-capture.ts` (SSE parser) and
   `<name>-browser.ts` (a class implementing `ChatProvider`).
3. Register the class in `createProviderBrowser()` in `index.ts`
   (`provider === 'yourid' ? new YourBrowser({…}) : …`). This one factory is
   used BOTH at startup and by the live `/provider` switch, so a new backend is
   switchable without a restart for free.
4. Add the provider's own config section (`qwen.model` etc.) to
   `ZamesConfig`/`DEFAULTS`/`CONFIG_SCHEMA` if it needs one.

Everything else (sessions tagged with `provider`, `probeUiHealth`,
per-provider profiles, the `{provider}` label) already works for any backend.

### Provider mechanics worth knowing:

- **Selectors and protocol markers go in ONE `*-ui.ts`** (`deepseek-ui.ts`,
  `qwen-ui.ts`). Never scatter a site-specific selector elsewhere.
- **SSE parsing goes in ONE `*-net-capture.ts`** (`net-capture.ts`,
  `qwen-net-capture.ts`). The answer is read from the raw network stream, not
  the rendered DOM, so a tool-call JSON survives intact. Qwen's stream is
  PHASE-based: `choices[].delta.content` is the answer only when `phase` is
  not `thinking_summary` (reasoning must never leak into the answer).
- **The Playwright facade is the `*-browser.ts` class** (`browser.ts`,
  `qwen-browser.ts`); it implements `ChatProvider`.
- **`probeUiHealth(page, capabilities)`** takes the capability list as a
  parameter, so each provider passes its own selectors while the probe logic
  stays shared (`ui-health.ts`).
- **Profiles are per provider**: `~/.zames/profile` (DeepSeek) and
  `~/.zames/qwen-profile` (Qwen). Two persistent contexts cannot share one
  `--user-data-dir` (SingletonLock), and separate profiles mean switching never
  signs the other provider out.
- **A provider switch is LIVE**: `/provider <id>` disposes the old browser
  and builds+launches the new one in place (`createProviderBrowser`), so no
  restart is needed. The chat is NOT portable across providers (ids belong to
  one backend), so the new backend opens a FRESH chat; if the old chat had
  messages they are summarized and posted as a handoff with the next task. An
  EMPTY chat is switched silently (nothing to carry over). `/model` also
  applies live.

Qwen specifics worth knowing when you touch it:

- The flow is `POST /api/v2/chats/new` → `POST /api/v2/chat/completions?chat_id=…`
  (the older `/api/chat/completions` is dead). Chat ids are UUIDs; a guest
  chat is `/c/guest`.
- **Guest mode has a hard daily limit.** `POST /api/v2/files/getstsToken` (and
  the completions endpoint) answers `RateLimited`
  ("You've reached the guest chat limit for today's usage") once exhausted. A
  guest cannot upload files at all. For real work the operator must sign in.
- **Attachments** go through the mode menu: click `.mode-select-open` (the
  "+"), then the "Upload attachment" item — that click fires a real
  `filechooser`. Setting files directly on the hidden `input#filesUpload`
  bypasses the UI state (it can show "Upload failed"), so it is only the
  fallback.
- **The model is driven through the header `.wms-trigger` dropdown**
  (`_applyModel()`), matched by a NORMALIZED label (`qwen3.7-plus` ↔
  `Qwen3.7-Plus`).
- **Login is email → code.** Qwen's default sign-in (`chat.qwen.ai/auth`) sends
  a one-time code to the email; the password form is behind "Log in with a
  password". `_promptAndLogin()` implements email → Continue → ask the operator
  for the code in the terminal → submit. `isLoggedIn()` is detected from the
  PAGE (the guest header has "Log in"/"Sign up" buttons; a signed-in one shows
  the account menu) and POLLS, because the app briefly renders the guest header
  before hydrating. The `auths/refresh` API answers `Bad_Request` without the
  app's own header, so it cannot be used from a bare fetch.
- **The page mounts late** ("Model loading…"): always poll for the input
  (`_awaitInput`) instead of a single lookup. If the input is gone entirely
  (the page crashed during a cancelled send), re-navigate to `CHAT_URL` before
  failing the attempt.
- **The guest tier is slow and rate-limited.** A cold guest turn measured up
  to ~9 minutes (huge system prompt + thinking phase); the rest of the turns
  are 8-25 s. The agent-loop watchdog is therefore derived from the Qwen
  answer timeout (`providerAskDeadlineMs` in `config.ts`), NOT the DeepSeek
  240 s default. The guest **daily** limit is a separate, non-retryable
  failure (`isGuestLimitText`), surfaced as a clear "sign in" message instead
  of the rate-limit wait.
- **No 15 s throttle.** Qwen tolerated 4 back-to-back sends at 0 ms gap, but
  the 5th hit "too frequent" (a 5-min back-off), so
  `qwen.minSendIntervalMs` defaults to 4000 ms — far below DeepSeek's 15 s, so
  do not copy that value.

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

### Qwen smoke

`npm run qwen-smoke` is the Qwen counterpart: a REAL isolated `QwenBrowser`
against live `chat.qwen.ai`. It copies `~/.zames/qwen-profile` read-only into a
throwaway `HOME` (`ZAMES_QWEN_SMOKE_HOME`), symlinks the Playwright cache and
NEVER opens the live profile — it can run alongside a live agent. Scenarios:
`login`, `newChat`, `ask:simple`, `ask:second-send` (guards the "text entered
but the send button was not pressed" regression), `listModels`, `tokenUsage`,
`toolCall` (the model must return a parser-recognised JSON tool call). Flags:
`--headed`, `--no-reuse-profile`, `ZAMES_QWEN_SMOKE_KEEP=1` keeps the temp HOME.
Exit codes match self-smoke (`0`/`1`/`2`).

### GLM smoke

`npm run glm-smoke` is the GLM counterpart: a REAL isolated `GlmBrowser` against
live `chat.z.ai`. It copies `~/.zames/glm-profile` read-only into a throwaway
`HOME` (`ZAMES_GLM_SMOKE_HOME`), sets `ZAMES_NONINTERACTIVE_LOGIN=1` (a fresh
profile is gated by an Aliyun slider captcha a headless browser cannot pass, so
a cold login must fail FAST with exit code `2`) and NEVER opens the live
profile. Scenarios: `login`, `newChat`, `ask:simple`, `ask:second-send`,
`listModels`, `tokenUsage`, `toolCall`, `history`. Flags: `--headed`,
`--no-reuse-profile`, `ZAMES_GLM_SMOKE_KEEP=1`.

### Passing flags through npm (`--` is mandatory)

`npm run dev --provider glm` does NOT pass `--provider` to zames: npm swallows
unknown `--flags` itself (it warns `Unknown cli config "--provider"`) and hands
the script only `glm` as a bare positional, so zames starts with its DEFAULT
provider (DeepSeek) and ignores the value. Always separate npm's own arguments
from the script's with `--`:

```bash
npm run dev -- --provider glm     # correct: zames sees --provider glm
npm run dev --provider glm        # WRONG: npm eats the flag
```

This is an npm rule, not a zames bug (the same applies to `--headed`,
`--task`, ...).

### Browser login during development

The interactive sign-in opens a VISIBLE window when the automatic paths fail
(see DESIGN-NOTES "Browser-based login"). `--dev` / `--headed` keep it visible;
a non-interactive run (or `ZAMES_NONINTERACTIVE_LOGIN=1`) never opens one.
`src/browser-login.ts` is imported by the browser CLASSES, which `/reload` does
NOT reload — a change there needs a process restart, like `browser.ts`.

Coverage: `npx tsx --test --experimental-test-coverage test/*.test.ts`.

This coverage run IS the test step of CI, and CI then runs ONE more check on
top of it: `npm run coverage:gate` (per-file floors for the critical modules,
listed in `FLOORS` in `scripts/coverage-gate.mts`; dropping below one fails the
job). A plain `npm test` is NOT a separate CI step — it is what you run locally,
and it is the same suite.

See `CONTRIBUTING.md` for the broader contribution flow and `AGENTS.md` for the
internal module map and design notes.
