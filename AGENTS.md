# AGENTS.md — internal structure of zames

This file is for those who work on the agent itself (including the agent
during self-review). README.md is for users. It is injected into EVERY task's
system prompt, so it is kept lean: the HARD RULES and the module map live here,
the deep root-cause write-ups live in `docs/DESIGN-NOTES.md` (read on demand).
`test/system-prompt-size.test.ts` pins the budget of the default prompt.

## NEVER touch a running browser or another agent's processes

HARD RULE for anyone working on zames: never kill, restart or clean up a
browser process you did not start yourself. The agent runs on the same
machine as the browser it drives, and possibly alongside ANOTHER running
zames/agent instance that uses Playwright too.

- Do NOT run pkill/kill/taskkill/Stop-Process on chrome/chromium/playwright.
- Do NOT delete ~/.zames/profile or its Singleton* files while a browser may
  be running - that is the profile the live agent uses, and removing it
  mid-run breaks the agent <-> chat connection.
- Do NOT call browser.close() / browser.stopGeneration() from an
  out-of-band script to clean up. Only the agent loop owns those calls.
- If you need a browser for a test, launch a SEPARATE one with its own
  --user-data-dir (or --isolated for MCP). Never point a test at
  ~/.zames/profile.

Reason: a browser on the SAME --user-data-dir cannot coexist with another
one. The second launch gets "Something went wrong when opening your
profile" and both sides lose state. This actually happened: a verification
run of @playwright/mcp (without --isolated) grabbed ~/.zames/profile,
conflicted with the live agent, and the cleanup killed the agent browser.

## MCP and the shared profile

@playwright/mcp uses the SAME default profile directory as zames
(~/.zames/profile) unless told otherwise. Two consequences:

1. When configuring the playwright MCP server for zames, ALWAYS pass
   --isolated (in-memory profile) or an explicit separate
   --user-data-dir. Otherwise the MCP browser and the agent browser fight
   over one profile and the chat breaks.
2. When testing MCP by hand, also use --isolated / a temp --user-data-dir
   and never the agent profile.

## What it is

zames is a terminal coding agent. It does not use the model API directly; it
drives a browser (Playwright) and talks to a chat web app like a regular user:
it types the prompt into the input field and reads the answer from the page.

THREE chat backends are supported, selected with `/provider <deepseek|qwen|glm>`:

- **DeepSeek** (`chat.deepseek.com`) — the original and the default; provider
  code in `src/browser.ts` + `src/deepseek-ui.ts` + `src/net-capture.ts`.
- **Qwen** (`chat.qwen.ai`) — the second backend; provider code in
  `src/qwen-browser.ts` + `src/qwen-ui.ts` + `src/qwen-net-capture.ts`.
- **GLM** (`chat.z.ai`) — the third backend; provider code in
  `src/glm-browser.ts` + `src/glm-ui.ts` + `src/glm-net-capture.ts` +
  `src/glm-chats.ts`. The recon facts live in `test/fixtures/glm/`.

All implement the `ChatProvider` interface (`src/types.ts`); everything above
the browser (agent loop, tools, parser, system-prompt) is provider-agnostic and
only depends on `BrowserLike`.

The provider registry (`src/providers.ts`) carries CAPABILITY FLAGS
(`hasModelPicker`, `guestAllowed`, `profileDir`) instead of `=== 'qwen'`
checks at a dozen call sites: `/model`, the context window, the answer timeout,
handoff and the login wiring all read a capability, so adding a backend is a
data entry plus its own modules.

`/provider <id>` switches LIVE: it closes the current backend and builds +
launches the other one IN PLACE (`createProviderBrowser()` in `index.ts`, the
ONE factory used at startup too), so no restart is needed. Each provider has
its OWN browser profile (`~/.zames/profile`, `~/.zames/qwen-profile`,
`~/.zames/glm-profile`), so switching never signs the other one out. A chat id
belongs to ONE backend, so the new provider opens a FRESH chat; if the old chat
had messages they are summarized and posted as a handoff with the next task,
while an EMPTY chat is switched silently (no useless "please compact" message).

It runs in the project directory (`process.cwd()`), which is the sandbox
root: tools cannot read/write above it.

## Execution flow

1. `src/index.ts` — CLI, argument parsing, the main input loop, `/...` commands.
2. `src/agent-loop.ts` — the agent loop: sends the task, parses the model's
   answer, looks for a tool-call, runs the tool, returns the result to the
   model. Up to `maxIterations` iterations (0 = UNLIMITED by default).
3. `src/browser.ts` — all Playwright work: finding the input field, inserting
   text (a paste event for contenteditable), waiting for the answer, reading
   the answer, Stop/Esc, determining the current chat id, listing chats.
4. `src/system-prompt.ts` — builds the system-prompt (tool descriptions,
   working directory, git context).
5. `src/tools.ts`, `src/gitTools.ts`, `src/web.ts` — tool implementations.

## Before you edit X, read DESIGN-NOTES §Y

The deep mechanics are NOT repeated here. Read the matching section of
`docs/DESIGN-NOTES.md` BEFORE changing the module:

| Editing                                      | Read DESIGN-NOTES                                   |
| -------------------------------------------- | --------------------------------------------------- |
| `agent-loop.ts` retry/guard/stale-echo logic | "The agent stopped", "Stale-echo heuristic"         |
| `browser.ts` answer reading / `_askOnce`     | "The agent stopped", "The Continue button"          |
| the "Stopped"/Continue/`quasi_status` family | "The Continue button", "The \"Stopped\" hang"       |
| `net-capture.ts` detectors                   | "The Continue button" (raw body, not `_netCapture`) |
| input line / paste / resize / attachments    | "Terminal input", "Resize", "Attachments"           |
| the Ink TUI (`src/tui/`)                     | "Ink TUI"                                           |
| `glm-*.ts` (z.ai provider)                   | "GLM / chat.z.ai"                                   |

## Module map (who owns what)

When a change touches one concern, start in the module that owns it:

### Module map (who owns what)

When a change touches one concern, start in the module that owns it:

- `src/index.ts` — CLI, main loop, slash-command dispatch, the message queue,
  the `/goal` and `/loop`|`/cron`|`/jobs` commands, the scheduler ticker, and the
  hot-reload `mod` bag (`reloadModules`/`autoReload`). Command _logic_ that can
  be pure lives in `src/commands.ts`; the pure CLI argument parsing lives in
  `src/cli-args.ts` (`createCliArgs(argv)`); the paste-aware raw-TTY reader
  `promptOnce()` lives in `src/prompt.ts`; `runTask` (task execution + queue
  draining) lives in `src/run-task.ts`; the PURE `/config` text rendering
  (`formatConfigList`/`configGetValue`/`configValueHint`) lives in
  `src/config-commands.ts` (unit-tested), and the `/config` subcommand
  DISPATCHER (`handleConfigCommand`: list/get/set/reset/lang/path) lives in
  `src/config-command.ts` — it drives live state through INJECTED callbacks
  (print/getValue/setValue/resetField/showList/openMenu/...), so the routing is
  unit-tested without a live agent (test/config-command.test.ts); index.ts wires
  the deps and keeps `setConfigRuntime` (live-apply for locale/toggles/width).
- `src/agent-loop.ts` — one task: send → parse → run tools → loop; the retry
  budgets, the protocol/stale guards, the auto-compact seam. The pure half
  (the tool-call PARSER + the answer heuristics) lives in `src/answer-parse.ts`
  and is imported directly; it is NOT re-exported from here.
- `src/browser.ts` — the DeepSeekBrowser facade over Playwright: send/answer,
  toggles, Continue, login, chats, attachments, history. Large by nature; the
  pure parts (answer cleaning, signal detection) live in `src/net-capture.ts`,
  the state-free helpers (password prompt, headless-UA cache, answer/limit
  predicates, error classes, profile cleanup) in `src/browser-pure.ts`, the
  chat-list / message DOM scrapers + the history-payload parser in
  `src/browser-chats.ts`, and the in-page DOM callbacks (answer/toast readers,
  `_chatSignal`, Stop/Continue probes+clicks, /debug-dom counts) in
  `src/browser-dom.ts`. The pure halves are RE-EXPORTED where the old API lived
  (unchanged importers); the browser-dom callbacks have no public API and are
  simply imported.
- `src/deepseek-ui.ts` — PURE DATA + resolvers: EVERY selector, button-label
  regex and SSE protocol marker for chat.deepseek.com. This is the ONE place to
  audit (and fix) when DeepSeek ships a redesign; `browser.ts` imports the
  constants and keeps only the Playwright logic. The `ds-*` class anchors stay
  as a high-precision FIRST hit with SEMANTIC fallbacks after them. A few
  regexes are re-exported from `browser.ts` for the existing tests.
- `src/qwen-ui.ts`, `src/qwen-net-capture.ts`, `src/qwen-chats.ts`,
  `src/qwen-browser.ts` — the Qwen
  provider, mirroring the DeepSeek split: PURE selectors/protocol data
  (`qwen-ui.ts`), the PURE phase-aware SSE parser
  (`qwen-net-capture.ts`: `extractAnswer` skips `thinking_summary`,
  `extractTokenUsage`, `isFinishedWithoutAnswer`, `isRateLimitText`,
  `isGuestLimitText`), the PURE chat-list/dialogue scrapers
  (`qwen-chats.ts`: `scrapeQwenChatList`, `scrapeQwenChatMessages` — the latter
  keeps only the OUTERMOST message container so a turn is not printed twice),
  and the Playwright facade `QwenBrowser` (`qwen-browser.ts`). Qwen's flow
  differs from DeepSeek's: the model is chosen via the header `.wms-trigger`
  dropdown (`_applyModel()`), the sign-in is email → one-time CODE (not a
  password) on `chat.qwen.ai/auth`, attachments go through the mode menu's
  "Upload attachment" item (`_attachFiles`), and a guest gets a limited number
  of turns before `getstsToken` answers `RateLimited`.
- `src/browser-login.ts` — the SHARED interactive sign-in
  (`interactiveBrowserLogin`): an existing session, then the saved credentials,
  then a HUMAN in a visible browser window (a captcha cannot be typed into a
  terminal), then back to headless. PURE in the sense that it owns no
  Playwright/disk: the provider injects probeLogin/relaunch/openLoginPage/...
  and the sequence is unit-tested. `canShowWindow` / `loginIsInteractive` are
  the pure gates; `ZAMES_NONINTERACTIVE_LOGIN=1` (one-shot, no TTY) makes a
  cold login fail FAST instead of hanging. Each browser class implements
  `relaunchSafe(headless)` (NOT `_launchOnce`: it keeps the profile, waits for
  the Singleton lock and re-applies session-only cookies).
- `src/send-telemetry.ts` / `src/send-throttle.ts` / `src/send-runtime.ts` —
  the per-send JSONL telemetry (`~/.zames/logs/sends-<provider>.jsonl`: timing,
  mode flags, outcome and the server error; NEVER the prompt/answer), the PURE
  adaptive-throttle state machine (soft window budget, Retry-After, doubling
  after a limit, halving after K successes) and the runtime that wires both
  into a browser. `browser.sendTelemetry` (on by default) controls the file;
  the adaptive mode is per provider (GLM: on). `/limits` shows the aggregate.
- `src/glm-ui.ts`, `src/glm-net-capture.ts`, `src/glm-chats.ts`,
  `src/glm-browser.ts` — the GLM provider, mirroring the Qwen split: PURE
  selectors/protocol data, the phase-aware SSE parser (only `phase: 'answer'`
  is the answer; `thinking`/`tool_call`/`tool_response` are skipped), the
  chat-list/history parsers + DOM scrapers, and the Playwright facade. z.ai
  gates the first message with an Aliyun slider captcha, so a real login is
  mandatory for a long run.
- `src/ui-health.ts` — PURE UI health probe (`probeUiHealth`): checks the
  ALWAYS-present controls (input/send/toggles/new-chat) via an injected page
  and reports the missing ones. The capability LIST is a parameter, so each
  provider passes its own selectors (deepseek-ui.ts / qwen-ui.ts); the probe
  logic is shared. `browser.probeUiHealth()` adapts the live page; startup and
  `/doctor` surface a missing CRITICAL capability as a warning BEFORE a task
  hangs on it. Unit-tested (test/ui-health.test.ts).
- `src/commands.ts` — PURE helpers for the slash commands (`/diff`, `/cost`,
  `/export`, `/doctor`, `/add-dir`, `/review`, `/compact`,
  `/queue`, `/goal`, live toggles) and the restored-history rendering. No
  browser/terminal access — unit-tested.
- `src/backlog.ts` — PURE BACKLOG.md maintenance: `collapseBacklog()`,
  `backlogStats()`, `nextBacklogId()`, `appendBacklogItem()`. `index.ts` only
  reads/writes the file; `/backlog` appends deterministically, `/improve`
  prunes the archived `<details>` blocks afterwards. Unit-tested.
- `src/scheduler.ts` — PURE interval/cron parsing and the `Scheduler` (loop and
  cron jobs). The 1-second ticker lives in `src/index.ts`.
- `src/compact.ts` — `performCompact()`, shared by the manual `/compact` and the
  auto-compact seam in the loop.
- `src/subagent.ts` — `createSubagentRunner()`: builds the `onSubagent`
  callback for runAgentLoop. A model `Task` call is a SEAM handled by the loop
  (like `onAutoCompact`), not an ordinary tool: the runner opens a FRESH chat
  (context isolation — in zames "context" IS the chat), runs a NESTED
  runAgentLoop (`freshChat:true`+`sendSystemPrompt:true`, `subagent_type`
  explore=read-only tools / general=full), restores the parent chat + send
  hooks, and returns ONLY the subagent's final report. Sequential by design:
  subagents SAVE CONTEXT, they do NOT run in parallel (one browser, one send
  slot), so the guidance is never to "speed up" but to keep the main chat
  small. Each Task call opens a FRESH chat (a new subagent); nothing is
  reused. Subagent chats are NOT saved as sessions (`onChatReady: () => {}`)
  and are left open under DeepSeek's own titles, so `/chats` (which reads the
  DeepSeek sidebar) DOES show them, while `/sessions` (`~/.zames/.sessions`)
  does NOT. On when `browser.subagents` (default true). The `Task` tool's
  description and
  the system-prompt `## Task tool (subagents)` section (injected only when the
  tool is offered) tell the model WHEN to delegate.
  Guards baked into the runner: NO recursion (the subagent never gets the Task
  tool and the nested loop runs with `onSubagent:null`), `selfImprovement:false`
  (a subagent never edits BACKLOG.md, even in dev mode), the parent's UI hooks
  are FORWARDED into the nested loop (`onThinking`/`onSendPause`/`onSendState`/
  `onNotice`) so the spinner keeps animating during a long subagent run, an
  `ask` permission rule also prompts the operator for the subagent
  (`onAskPermission`), and the report is capped (`capReport`, 20k chars) before
  it becomes a parent-context tool result.
- `src/net-capture.ts` — parse the raw SSE/JSON the model sends (answer text,
  token counter, truncation/no-answer/rate-limit detection).
- `src/i18n.ts` — the localized `CATALOG` (ru/en) for everything the operator
  sees; `src/input.ts` and `src/spinner.ts` read labels from it.
- `src/input.ts` — the custom `LineEditor` (permanent input line, status above,
  paste/attachments, history, slash hints). `src/spinner.ts` is the non-TTY
  fallback UI. Both draw an animated dot status; shared formatting is imported
  from one another (`randomThinkingPhrase`, `stripEllipsis`). The editor's PURE
  halves live in `src/input/layout.ts` (visual rows / cursor / paste markers /
  token formatting) and `src/input/suggest.ts` (slash-command match / paging /
  completion), both unit-tested without driving the real terminal.
- `src/tui/` — the **Ink/React TUI** (the modern input UI). `ui.tui` (default
  true) selects it; the legacy `LineEditor` stays as a fallback and for non-TTY.
  `TuiEditor.tsx` is the drop-in adapter implementing the SAME surface as
  `LineEditor` (`printAbove`, `lock`, `busy`, `toolCall`, ... — see
  `src/tui/types.ts`'s `UiEditor`), so `index.ts`/`run-task.ts` are unchanged and
  talk to either engine through that interface. The bridge is `store.ts`
  (`TuiStore`, an external store React subscribes to via `useSyncExternalStore`:
  the imperative agent calls mutate it, Ink re-renders). PURE halves: `edit.ts`
  (buffer/cursor/history/search/paste transitions) and `keys.ts` (Ink `(input,
key)` -> editor action), both unit-tested (test/tui-edit.test.ts). Components:
  `TuiApp.tsx` (root + store subscription), `LogView.tsx` (`<Static>` scrollback),
  `StatusBar.tsx` (animated spinner + badges), `InputLine.tsx` (multiline editor
  with a real cursor via `useCursor`, bracketed paste via `usePaste`),
  `ConfigMenu.tsx` + `run-config-menu.tsx` (the Ink `/config` menu). `ui.tui`
  and `ui.alternateScreen` (full-screen mode) are config flags. More PURE halves
  (all unit-tested): `FullScreenApp.tsx` (the alternate-screen layout) +
  `log-window.ts` (row-based log windowing),
  `login-pure.ts` + `LoginForm.tsx`/`TextPrompt.tsx`/`run-login.tsx` (in-TUI
  login / one-time code), `widgets.tsx` (Checkbox/Select/Hint/HintBar),
  `SelectList.tsx`/`run-select.tsx` (list menus for `/model`,
  `/chats`, `/sessions`), `ConfirmDialog.tsx`/`run-confirm.tsx` (permission
  ask), `useMouseWheel.ts` (SGR wheel + DECSET 1007 off).
- `src/context.ts` — AGENTS.md / MEMORY.md / skills / custom commands loading.
  `loadProjectContext(workdir, touchPaths?)` also pulls NESTED AGENTS.md/MEMORY.md
  from the directories a task touches (path-scoped rules) into a separate
  `scopedAgents` list; `renderContextSection()` renders them as their own
  section.
- `src/permissions.ts` — PURE approval policy for tool calls: parses
  `.zames/permissions.json` (`default` + `rules` with `tool`/`command`/`path`
  regexes and an `allow`|`deny`|`ask` action) and `decidePermission()` returns
  the action. Wired in `agent-loop.ts` BEFORE each tool: `deny` blocks the call,
  `ask` goes through the `onAskPermission` callback (index.ts prompts the
  operator). Unit-tested (test/permissions.test.ts, test/permissions-loop.test.ts).
- `src/config.ts`, `src/config-menu.ts` — config defaults/schema and the menu.
- `src/sessions.ts`, `src/transcript.ts`, `src/undo.ts` — persistence.
- `src/checkpoint.ts` — tar snapshot/restore of the working tree;
  `/rewind` uses it. `src/hooks.ts` — tool + LIFECYCLE hooks
  (`.zames/hooks.json`): PreToolUse/PostToolUse plus SessionStart (fresh chat),
  UserPromptSubmit (before a send; stdout is appended to the prompt), PreCompact
  (start of /compact), Stop (end of a task) and SubagentStop (after a subagent).
- `src/diagnostics.ts` — post-edit diagnostics: `shouldRunDiagnostics()`
  gates by tool, `runDiagnostics()` runs a configured command and
  `summarizeDiagnostics()` collapses its output to error lines (capped). Wired in
  agent-loop after a mutating tool; off by default (`config.diagnostics`).
- `src/statusline.ts` — the statusLine hook: `runStatusLineCommand()` runs
  `ui.statusLineCommand` with a JSON status on stdin and returns its first
  stdout line. index.ts runs it on its own timer and calls
  `editor.setStatusLine()` (never per-render — a spawn would block typing).

## Tools

File tools (src/tools.ts): Read, Write, Edit, Bash, BashOutput, Glob, Grep.
`Read` returns metadata (never mojibake) for an image or a binary file;
`Bash` takes `run_in_background` and `BashOutput` polls/kills such a process.
Extra tools (src/extraTools.ts): LS, MultiEdit, TodoWrite, ApplyPatch.
Git (src/gitTools.ts): GitStatus, GitDiff, GitLog, GitShow, GitBranchList,
GitAdd, GitCommit, GitPush.
Web (src/web.ts): WebFetch, WebSearch.
Operator: AskUser (a modal question; handled by the caller, dropped in plan
mode). Service: respond (final answer to the user, finishes the task).

`Read` returns RAW file content by default (the contract Edit relies on: the
model copies `old_string` from the Read output). Optional `numbered=true`
prepends `cat -n`-style line numbers — purely for reference, the model must
NOT copy the prefix into Edit. Very long lines (>2000 chars) are truncated in
both modes so one minified line can't flood the context; an empty file returns
a `(file is empty)` note instead of an empty string. When changing this format,
keep the raw default: `Edit`/`MultiEdit` string matching would break otherwise.

The tool list is assembled in `createTools()` (src/tools.ts) and passed into
the system-prompt. Extra tools (LS, MultiEdit, TodoWrite, ApplyPatch) live in
`createExtraTools()` (src/extraTools.ts) and are merged in by `createTools()`.
To add a tool — describe it in the relevant module and add
it to the shared list.

### Required-argument guard (the `undefined` file bug)

Every tool that takes a required string arg (`path`, `command`, `pattern`) must
pass it through the `req(v, name)` helper (in `src/tools.ts` and
`src/extraTools.ts`) before use. Reason: the model sometimes emits a call that
OMITS the required key (e.g. `{"tool":"Write","args":{"content":"..."}}`).
`String(undefined)` is the literal `"undefined"`, so the old `safe(String(p))`
happily created a file literally named `undefined` in the working directory.
This really happened, repeatedly. `req()` throws
`Missing required argument: <name>` for undefined/null/empty/`"undefined"`/
`"null"`. Safety nets: `.gitignore` ignores `undefined`, and
`test/undefined-guard.test.ts` covers it. When you add a tool with a required
arg — use `req()`.

## Language policy (agent-facing vs user-facing)

Two different languages live in the code and MUST NOT be mixed up:

- **Agent-facing text is ENGLISH.** Everything the MODEL sees — tool
  descriptions, tool parameters, tool-result strings and errors, the
  corrective/nudge messages in `agent-loop.ts`, the labels in the
  system-prompt (`### <Tool>`, `Parameters:`), MCP tool descriptions — must be
  in English (like Claude Code / Codex). These files must contain NO Cyrillic:
  `src/tools.ts`, `src/extraTools.ts`, `src/gitTools.ts`, `src/web.ts`,
  `src/system-prompt.ts`.
- **User-facing text is LOCALIZED.** Everything the OPERATOR sees in the
  terminal (help, service messages, spinner, warnings, `/config` labels) goes
  through `src/i18n.ts` (`CATALOG`, picked by `ui.locale`). Do not hardcode a
  user string in a module — add a key to CATALOG (both ru and en).
- **Functional Cyrillic stays.** DOM selectors and regexes that match
  DeepSeek's Russian UI (`button[aria-label*="отправ"]`, `/остановить/`,
  rate-limit matchers), the `(прервано пользователем)` sentinel and the
  bilingual `looksLikeUnfinishedWork` matchers are NOT prose — leave them.

When adding a tool: write its description/params in English. When adding a
message the operator sees: add it to CATALOG. Never put Russian prose into a
tool description or an agent-loop nudge.

## Comments in code

A comment must explain **WHY**, not **WHAT**. Code already says what it does;
a comment is valuable only when it carries something a reader cannot infer:

- the non-obvious REASON for a choice, a hidden coupling, a platform/server
  quirk, or a past bug it prevents (e.g. why a 15s throttle exists, why the
  `HeadlessChrome` UA must be stripped, why a detector reads the RAW SSE body);
- a WARNING (race, side effect, ordering requirement);
- a short rationale for a workaround.

Do NOT:

- restate the code (`// set the flag`, `// return the result`) or the function
  name;
- reference backlog/task numbers (`A1`, `B12`, …) — those files get deleted and
  the references rot. For traceability use a commit SHA (`// see 9fa866c`) and
  only when it genuinely helps;
- leave commented-out code (delete it; git remembers);
- narrate progress or history in the code.

When editing, keep existing "why" comments even if the code around them moves.

## tool-call format

The model's answer is read NOT from the DOM but by intercepting the network
(`src/net-capture.ts`, `browser._installNetHook`): DeepSeek renders the answer
(markdown+LaTeX) and distorts the arguments (the `$` in formulas is lost,
escaped newlines become real, names are auto-linked), the interception returns
the RAW SSE/JSON text. The parser (`parseToolCall()`, src/answer-parse.ts)
tries in order: JSON (incl. a ``` block and repaired backslashes), permissive
dirty JSON, a tail after prose, XML/DSML (`src/xml-toolcall.ts`) and finally
`repairToolCallPreamble()` for a broken call head. It collects EVERY recognized
call, not just the first. If the answer LOOKS like a call but is not
recognized, the loop re-asks (`MAX_UNPARSED_RETRIES`) instead of finishing.
When you add an answer format — add parsing there, not a model-side promise.

Rules that must survive any refactor:

- `repairRawControlChars()` escapes raw newlines/tabs inside JSON string values
  (`old_string`, `new_string`, `content`), otherwise `JSON.parse` fails on a
  multiline call;
- for `Edit` and dirty JSON the args are parsed from the "tail" to the end of
  the text, because bracket balancing breaks on raw quotes inside strings;
- the XML/DSML tail trim uses `<[^>]*>`, not `<[^>]>` (multi-char tags);
- `parseInlineJsonArgs()` handles the hybrid form: the tool name is an
  attribute AND the args are inline JSON in the SAME opening tag
  (`<|DSML|invoke name="GitAdd", "args" {"paths": "AGENTS.md"}>`);
- `parseToolCallPermissive()` handles a call whose arg keys sit INLINE with
  `"tool"`, with no `"args"` wrapper — it flattens the object's keys into args.

Write/Edit accept base64 variants (`content_base64`, `old_base64`/
`new_base64`): base64 is `[A-Za-z0-9+/=]` only and survives the channel that
corrupts `$`, backslashes and newlines. The system-prompt tells the model when
to use them.

The SAME interception captures the CONTEXT SIZE: DeepSeek sends
`accumulated_token_usage` in the SSE stream; `extractTokenUsage()`
(src/net-capture.ts) returns the latest value and `browser.getLastTokenUsage()`
exposes it (`/cost`, `/status`, `/resume`). No tokenizer dependency: the server
counter is the truth. Debug dumps land in `~/.zames/net-log` ONLY with
`ZAMES_NET_DEBUG=1`, and both that dir and `~/.zames/logs` are ROTATED (keep
the newest 200); an unbounded dump once grew to 77k files / 800 MB.

## Editing text files: prefer Edit/Write over sed -i

Do NOT rewrite markdown or source with an in-place sed. In practice an
in-place sed on CHANGELOG.md spliced the file header into a section and
that corruption was committed (it had to be rebuilt from git). sed
mangles multi-line content and special characters. Use the Edit/Write
tools (or a small node script) for anything with newlines or special
characters.

## Developer docs

`README.md` is for USERS of the package — it must stay free of anything about
developing zames itself (no BACKLOG, no self-review, no `/improve`, no test/
build internals, no module map). The self-development material lives in
`DEVELOPING.md`: dev mode, the dev-only commands, BACKLOG.md maintenance and
the pre-release checks. Deep root-cause write-ups live in
`docs/DESIGN-NOTES.md`. (This file, AGENTS.md, is agent-facing and is NOT
shipped in the npm package.)

## Dev-only commands (self-development)

Commands that only make sense while developing zames itself are DEV-ONLY:
`/improve`, `/backlog`, `/self-review`, `/self-fix`, `/self-done`, `/self-list`,
`/self-diff`, `/self-apply`. A regular user who installed the package must
never see or run them — `/improve` on an arbitrary project would edit that
project's BACKLOG.md, and `/self-review` would snapshot its `src/`.

Enforced in three places, all keyed on `devMode` (`--dev` / `config.hotReload`,
set by `npm run dev`): `printHelp()` omits the block; `buildSlashCommands()`
filters `isDevOnlyCommand(c.name)` out of the «/» hints; the main loop REJECTS a
dev-only command with `msg.dev_only` when not in dev mode (hiding is not enough
— a user can type it by hand). The list has ONE source of truth:
`DEV_ONLY_COMMANDS` / `isDevOnlyCommand()` in `src/commands.ts` (pure, tested).

## BACKLOG.md is gitignored

`BACKLOG.md` is the agent's own improvement-notes file. It is listed in
`.gitignore` and MUST NOT be committed: it is rewritten constantly and would
otherwise be published with every release. A `git add -A` silently skips it,
which is the intended behavior. `/backlog <text>` records an idea without
implementing it; `/improve` auto-prunes the archived `<details>` blocks after a
successful run (`collapseBacklog()` tolerates an UNCLOSED `<details>`). In
`--dev` mode the system prompt (`selfImprovement`) lets the model append ONE
short note itself when it spots an improvement outside the current task, and a
startup warning fires past 500 lines / 60 KB. The pure helpers live in
`src/backlog.ts`.

## The TodoWrite checklist must be kept current

The status line shows `[Provider] задачи: N/M` from `TodoWrite`. It is a
progress indicator the OPERATOR watches, so a stale list is misleading.

- Write the checklist BEFORE a multi-step task (more than ~3 steps).
- Update it AS you go: after finishing each step, resend the WHOLE list with
  that step `completed` and the next one `in_progress`. `TodoWrite` REPLACES the
  list, so every entry must be resent each time.
- The final update marks everything that is actually DONE as `completed`
  (leave a step `pending`/`in_progress` if it was genuinely not done — never
  mark unverified work as complete).
- A step that is blocked on the operator (e.g. a manual sign-in) stays
  `pending`, not `completed`.

## Talking to the operator

The operator does NOT read the model's free text. The only thing that reaches
the operator is the `message` field of the last `respond` call before the agent
stops. Therefore all text for the operator must be in that single final
`respond`: either "task done" (a report), or "cannot continue, need the
operator's decision" (a question). Calling `respond` in the middle and
splitting the report across several messages is not allowed.

DeepSeek likes to add short phrases around a tool-call: the system-prompt
forbids it and `runTask()` does not show pre-tool text, so only tool-calls and
the final `respond` reach the terminal. LIMITATION: the intermediate text in
DeepSeek's own chat cannot be removed by code — only forbidden via the prompt
and hidden from the operator.

## Deep mechanics — acting rules

Read `docs/DESIGN-NOTES.md` (see the table above) for the WHY; the rules you
must not break:

- **Answer reading**: `beforeText` and the `_askOnce()` comparisons MUST read
  the RENDERED DOM (`_readLastAnswerTextCleanDom()`), never `_netCapture`; the
  capture is only a freshness signal + the raw answer to RETURN.
- **Hooks the UI relies on**: `browser.onSendStart` (spinner starts on a real
  send), `browser.onSendPause` (animated throttle countdown), `onNotice`
  (rate-limit/service text reaches the operator above the input line). All three
  are wired in `runAgentLoop()` and cleared in `runTask()`'s `finally`.
- **Permissions**: `.zames/permissions.json`, `decidePermission()` runs BEFORE
  each tool in `agent-loop.ts`; `deny` blocks, `ask` prompts the operator.
- **`@file` refs**: `extractAtFileRefs()` (src/path-token.ts) finds `@path` at
  word boundaries (never `user@host` or `@Component`); `inlineAtRefs()`
  (src/index.ts) appends the contents under `## Files referenced with @ in the
task` (60 KB/file, 200 KB total, truncated with a note). Unreadable refs stay
  in the text as-is.
- **Control characters**: when editing input/terminal code do not put raw
  CR/LF into string literals — only the escape sequences (in src/input.ts they
  are assembled via `String.fromCharCode`).

## Input while the agent works (message queue)

While the agent thinks, the terminal stays live. In TTY the editor keeps the
input line in place and accumulates typed text; on Enter the text goes into
`pendingQueue` (src/index.ts). Esc / Ctrl+C abort the current generation
(`browser.stopGeneration()`), Ctrl+C while idle exits. Queuing a message must
NOT stop the "agent is working" spinner (`_doSubmit()` restarts the animated
status while `busy`). The queue is drained by `runTask()` after the current
task in the SAME chat (`freshChat: false`, `sendSystemPrompt: false`), and the
`while (true)` loop repeats until the queue is empty. The non-TTY fallback
`watchInput()` (src/run-task.ts) is kept for pipes only.

## Commands (main loop, src/index.ts)

The list of commands and their exact behaviour is user documentation — see
`docs/readme.en.md` (and `/help`). The ACTING rules for this code:

- Command logic that can be pure belongs in `src/commands.ts` (unit-tested);
  the `/config` subcommand dispatcher is `src/config-command.ts` with INJECTED
  callbacks (unit-tested without a live agent).
- `/compact` builds the summary in the OLD chat and posts it into a NEW chat
  with the system prompt. It MUST always complete: a rate limit retries
  `COMPACT_SUMMARY_ATTEMPTS` times, an unusable summary (tool-call JSON, DSML,
  `<ds_safety>`) is retried with "plain text only", and both fall back to a
  LOCAL summary from `fetchChatMessages` (last `COMPACT_FALLBACK_LIMIT` = 40
  messages). An exhausted chat (`contextExhausted`) skips the summary call
  entirely. See DESIGN-NOTES "Length limit reached".
- `/review`, `/init`, `/self-*` are thin drivers over the agent loop; keep the
  prompts in `src/commands.ts` when they are pure.

Custom commands and skills appear in the «/» hint list and in `/help`
(dynamic entries from `refreshDynamicCommands`).

## Project context: AGENTS.md / MEMORY / skills / commands (src/context.ts)

`loadProjectContext(workdir)` loads, in priority order: **AGENTS.md** (global
`~/.zames/AGENTS.md`, `~/.claude/CLAUDE.md`, then every AGENTS.md from the
filesystem root down to workdir — the deepest wins, case-insensitive name),
**MEMORY.md** (same chain; the prompt tells the agent to append durable facts),
**skills** (`SKILL.md` up to 3 levels deep under `.zames/skills`,
`.claude/skills`, `.agents/skills`, `skills`, plus the home dirs; only the YAML
frontmatter goes into the prompt, the body is read on demand) and **custom
commands** (`.md` under the same dirs, supporting `$ARGUMENTS`, `{{args}}`,
`$1`..`$N`, `$name`, plus `argument-hint:` and `arguments:` frontmatter — a
command with missing declared args is REJECTED with `msg.missing_args`).
`loadProjectContext(workdir, touchPaths?)` also pulls NESTED AGENTS.md/MEMORY.md
from the directories a task touches (path-scoped rules).

The `## Skills` section carries a DISCIPLINE paragraph (`SKILLS_DISCIPLINE`):
before a NON-TRIVIAL task the model must scan the list and Read a matching
skill's `file:` first. The bundled methodology skills (brainstorming,
writing-plans, systematic-debugging, verification-before-completion,
test-driven-development) are BAKED INTO `BUILTIN_SKILLS` so an npm user has
them out of the box; a project skill of the same name overrides a built-in.

## Configuration (src/config.ts)

Global `~/.zames/config.json`, local `<project>/.zamesrc.json`; defaults and
merging in `DEFAULTS`/`deepMerge`. `CONFIG_SCHEMA` is the single source of
truth for everything editable from `/config`: each entry has `path`, `type`, a
`labelKey`/`groupKey` (i18n keys — NO English strings in the schema; the
menu/list are localized) and optional `values`/`min`/`max`. To add a setting:
the section interface, a `CONFIG_SCHEMA` entry and the ru+en CATALOG keys. Do
NOT add secrets and values that require a restart (transcript.dir,
browserChannel).

`/config` opens the Ink menu (`runConfigMenu()`, editor paused while it runs)
or, with a subcommand, the text API (`list|get|set|reset|path|lang`) handled by
`src/config-command.ts`. Values are written to the HOME config, never to the
project `.zamesrc.json` (personal toggles must not leak into git). Writing does
not freeze defaults; the live config object is updated so the change applies
immediately.

**Precedence trap**: `loadConfig()` merges home THEN project, so a key present
in BOTH is decided by the project while `/config set` writes only the home one
— the change applies live and is silently reverted on the next launch.
`overriddenKeys()` (pure) lists the clashes, `shadowedConfigKeys()` stores them,
and both the startup warning and `/config set|lang` print `cfg.shadowed`. Do NOT
"fix" this by writing to the project file.

Defaults worth knowing: `browser.minSendIntervalMs` (15000, the pause between
sends — DeepSeek rate-limits), `browser.stabilityChecks`/`stabilityDelayMs`
(2 x 400ms settle loop), `browser.deepThinking`/`webSearch` (toggles applied in
`_applyToggles()` only when `aria-pressed` differs), `browser.autoContinue`
(true; Continue RESUMES a truncated turn and is clicked BEFORE any resend
throw), `browser.maxIncompleteRetries`/`incompleteWaitMs` (4 / 2000ms) and
`browser.maxContextLimitRetries`. The `quasi_status` family, Continue and the
"Length limit reached" recovery are described in DESIGN-NOTES.

### Localization (src/i18n.ts)

`Locale = 'ru' | 'en'`; strings live in `CATALOG` (`key → {ru, en}`) and are
read via `translate(locale)(key, params)`. Localized: help, «/» hints, service
messages, `/status`, `/config`, spinner phrases, and the agent's answer
language (`prompt.answer_language` in the system prompt). A new operator string
needs a key in BOTH languages (`test/i18n.test.ts` checks it). When the
language changes live, `currentLocale` and `config.ui.locale` are updated so
the next task's system prompt follows.

## Headless by default + login (src/browser.ts)

`headless` is TRUE by default; `--headed` shows the window for manual sign-in
and selector debugging. A headless Chromium advertises `HeadlessChrome/<v>`,
which DeepSeek's CDN answers with a plain `403` BEFORE the app loads — so the
SAME login worked headed and silently failed headless. `_fixHeadlessUserAgent()`
relaunches once with the marker stripped (`sanitizeHeadlessUA()`, tested). Any
new browser-launch logic must keep this: a headless run must never send a
`HeadlessChrome` UA to chat.deepseek.com.

`waitForLogin()` layers: an existing profile session → saved credentials
(`browser.auth.*`) → an interactive prompt in a TTY (`askPassword()` reads raw
stdin, echoes `*`; readline echo could not be muted and hung) → a manual hint.
`onAuthSave` persists the credentials (the browser module never writes the
config). `_persistSessionIfNeeded()` writes `~/.zames/auth.json`; `/doctor`
shows it. The password is masked in `/config`. Data lives in `~/.zames`
(profile, logs, undo, snapshots, `.sessions`, `auth.json`); temp files go to
`<project>/tmp` (gitignored, cleaned on launch).

## Sessions (src/sessions.ts)

Each chat id is saved as `~/.zames/.sessions/<id>.json`; `last.json` keeps
`byWorkdir` + a global `last`. On startup `main()` restores the last session
FOR the current working directory unless `--new-chat`/`--chat` is given.
SUBAGENT chats are INTERNAL: `markInternalChat(id)` denylists them
(`internal.json`), so `loadLastSession`, `listSessions` and `/chats` skip them
while `/resume-id` still opens by explicit id. So `/sessions` is the SAFE
resumable list; `/chats` is the raw backend list with internals hidden.

On resume the system prompt is NOT resent by default (`promptOnResume()`),
unless `--resend-prompt`/`browser.resendPromptOnResume` — a resumed chat
already contains it, and resending grew the context by ~65k chars per resume.

Restoring prints the visible dialogue (`fetchChatMessages()` first — the API
needs the `Authorization` header sniffed off real requests, cookies alone give
401; DOM scraping is the fallback). `normalizeRestoredMessage()` unwraps a
`respond` call to its message and drops tool-call noise, the system prompt and
`<ds_safety>`; only the last `RESTORED_HISTORY_LIMIT` (20) messages are shown.
Details: DESIGN-NOTES "The agent stopped" and the module comments.

## Other modules

- `theme.ts` — output palette (chalk); `spinner.ts` — the working spinner;
  `markdown.ts` — answer rendering; `diff.ts` — diff display; `undo.ts` —
  backups/revert; `transcript.ts` — transcript writing; `self-review.ts` —
  snapshots; `checkpoint.ts` — tar snapshot for `/rewind`; `hooks.ts` — tool and
  lifecycle hooks (`.zames/hooks.json`: Pre/PostToolUse, SessionStart,
  UserPromptSubmit, PreCompact, Stop, SubagentStop); `diagnostics.ts` —
  post-edit diagnostics (off by default); `statusline.ts` — the statusLine hook
  (runs on its own timer, never per-render).

## Verifying changes

`npm run self-smoke` (scripts/self-smoke.mts) launches a REAL zames instance in
an ISOLATED profile (throwaway HOME via `ZAMES_SMOKE_HOME`, copied
`config.json`, symlinked Playwright cache) and exercises login, tool calls,
attachments and send against live DeepSeek, printing PASS/FAIL per scenario. It
NEVER opens the operator's `~/.zames/profile` and can run alongside a live
agent. Flags: `--headed`, `--reuse-profile` (COPY the signed-in profile
read-only — use it when a cold login is blocked by anti-bot), `--profile <dir>`,
`ZAMES_SMOKE_KEEP=1`. Exit code 1 = a scenario failed, 2 = login failed. Add a
scenario when you add a user-visible feature. `npm run qwen-smoke` /
`npm run glm-smoke` are the provider counterparts (same isolation, run them
when you touch that provider; GLM needs `--headed`).

- `npm run typecheck` — tsc --noEmit over src/, test/ and scripts/**/*.mts
- `npm test` — `tsx --test test/*.test.ts`; watch: `npm run test:watch`
- `npm run lint`, `npm run format:check`, `npm run build`
- `npm run changelog:sync|check` — derive/verify the Unreleased section (CI
  enforces `check`; see DEVELOPING.md)
- Run: `npm start` (dist) or `npm run dev` (tsx over src/, HEADED)
- Temp dirs in tests MUST come from `test/tmp-dir.ts` (`makeTmpDir`), which
  registers cleanup: abandoned `zames-*` dirs inside WSL's ext4.vhdx never
  return their space.

## TypeScript

Strict; sources `src/*.ts`, build `tsc` into `dist/` (`tsconfig.json` for
IDE/typecheck incl. test/ and scripts, `tsconfig.build.json` for src only).
Imports use the `.js` extension (NodeNext) even in `.ts` files. Contracts
(tool-call, ToolDef, config, BrowserLike) live in `src/types.ts` — sync them
when the tool or the tool-call format changes.

Hot-reload (`/reload`, `--dev`) imports modules with `?t=timestamp`. ONLY the
modules in `RELOADABLE` (src/index.ts) are hot-reloaded. `browser.ts`,
`browser-login.ts`, the send-runtime modules, `index.ts`, `run-task.ts`, the
provider browsers and `src/tui/` are NOT: the live instance owns Playwright
state/timers, so a hot swap is unsafe and an edit there silently "does not
work" until the process is RESTARTED. Dev mode watches `browser.ts` and prints
a ONE-TIME warning (`reload.browser_restart`); the full protocol is in
DEVELOPING.md.

Self-review looks for the `.ts` sources: `src/` in dev, `../src` in a built
`dist/`. The published package has only `dist/`, so /self-review does not work
there.

## Releasing a new version

Releases are published by CI: `.github/workflows/publish.yml` runs `npm publish`
on a `v*` tag push. Do NOT run `npm publish` by hand.

A release happens ONLY on the operator's direct request — never self-initiated
after a fix, and several fixes land as ONE patch release (a 142-patch 2.82.x
branch made the CHANGELOG and npm unreadable). See DEVELOPING.md for the full
policy.

Order: (1) `npm run release patch|minor|major` — validates a clean tree, runs
the gates, bumps `version`, writes the dated CHANGELOG section, commits
`chore: release X.Y.Z` and creates the tag (it does NOT push); (2) push the
branch AND the tag (`git push` + `git push origin vX.Y.Z`) — the tag push
triggers the pipeline. `NPM_TOKEN` must be set in the repository secrets.

### Trigger phrases

"подними версию", "выпусти версию", "сделай релиз", "release", "bump the
version", "cut a release" mean the FULL flow, done without asking for each
step: choose the bump (fix → patch, feature → minor, breaking → major), bump
`version` in `package.json`, commit everything with `chore: release X.Y.Z`,
create the tag `vX.Y.Z`, push the branch and the tag. Then report the new
version and point the operator to the Actions tab / npm page.
