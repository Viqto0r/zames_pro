# AGENTS.md — internal structure of zames

This file is for those who work on the agent itself (including the agent
during self-review). README.md is for users.

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
drives a browser (Playwright) and talks to [chat.deepseek.com](https://chat.deepseek.com/) like a regular
user: it types the prompt into the input field and reads the answer from the page.

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

### Module map (who owns what)

When a change touches one concern, start in the module that owns it:

- `src/index.ts` — CLI, main loop, slash-command dispatch, `runTask`, the
  message queue, the `/goal` and `/loop`|`/cron`|`/jobs` commands, the scheduler
  ticker. Command _logic_ that can be pure lives in `src/commands.ts`.
- `src/agent-loop.ts` — one task: send → parse → run tools → loop; the retry
  budgets, the protocol/stale guards, the auto-compact seam.
- `src/browser.ts` — the DeepSeekBrowser facade over Playwright: send/answer,
  toggles, Continue, login, chats, attachments, history. Large by nature; the
  pure parts (answer cleaning, signal detection) live in `src/net-capture.ts`.
- `src/deepseek-ui.ts` — PURE DATA + resolvers: EVERY selector, button-label
  regex and SSE protocol marker for chat.deepseek.com. This is the ONE place to
  audit (and fix) when DeepSeek ships a redesign; `browser.ts` imports the
  constants and keeps only the Playwright logic. The `ds-*` class anchors stay
  as a high-precision FIRST hit with SEMANTIC fallbacks after them. A few
  regexes are re-exported from `browser.ts` for the existing tests.
- `src/ui-health.ts` — PURE UI health probe (`probeUiHealth`): checks the
  ALWAYS-present controls (input/send/toggles/new-chat) via an injected page
  and reports the missing ones. `browser.probeUiHealth()` adapts the live page;
  startup and `/doctor` surface a missing CRITICAL capability as a warning
  BEFORE a task hangs on it. Unit-tested (test/ui-health.test.ts).
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
  hooks, and returns ONLY the subagent's final report. Sequential by design;
  on when `browser.subagents` (default true). The `Task` tool's description and
  the system-prompt `## Task tool (subagents)` section (injected only when the
  tool is offered) tell the model WHEN to delegate.
- `src/net-capture.ts` — parse the raw SSE/JSON the model sends (answer text,
  token counter, truncation/no-answer/rate-limit detection).
- `src/i18n.ts` — the localized `CATALOG` (ru/en) for everything the operator
  sees; `src/input.ts` and `src/spinner.ts` read labels from it.
- `src/input.ts` — the custom `LineEditor` (permanent input line, status above,
  paste/attachments, history, slash hints). `src/spinner.ts` is the non-TTY
  fallback UI. Both draw an animated dot status; shared formatting is imported
  from one another (`randomThinkingPhrase`, `stripEllipsis`).
- `src/context.ts` — AGENTS.md / MEMORY.md / skills / custom commands loading.
  `loadProjectContext(workdir, touchPaths?)` also pulls NESTED AGENTS.md/MEMORY.md
  from the directories a task touches (B6, path-scoped rules) into a separate
  `scopedAgents` list; `renderContextSection()` renders them as their own
  section.
- `src/permissions.ts` — PURE approval policy for tool calls (C1): parses
  `.zames/permissions.json` (`default` + `rules` with `tool`/`command`/`path`
  regexes and an `allow`|`deny`|`ask` action) and `decidePermission()` returns
  the action. Wired in `agent-loop.ts` BEFORE each tool: `deny` blocks the call,
  `ask` goes through the `onAskPermission` callback (index.ts prompts the
  operator). Unit-tested (test/permissions.test.ts, test/permissions-loop.test.ts).
- `src/config.ts`, `src/config-menu.ts` — config defaults/schema and the menu.
- `src/sessions.ts`, `src/transcript.ts`, `src/undo.ts` — persistence.
- `src/checkpoint.ts` — tar snapshot/restore of the working tree (B3);
  `/rewind` uses it. `src/hooks.ts` — PreToolUse/PostToolUse hooks
  (`.zames/hooks.json`).

## Tools

File tools (src/tools.ts): Read, Write, Edit, Bash, Glob, Grep.
Extra tools (src/extraTools.ts): LS, MultiEdit, TodoWrite, ApplyPatch.
Git (src/gitTools.ts): GitStatus, GitDiff, GitLog, GitAdd, GitCommit, GitPush.
Web (src/web.ts): WebFetch, WebSearch.
Service: respond (final answer to the user, finishes the task).

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

IMPORTANT: the model's answer is read NOT from the DOM but by intercepting the
network (`src/net-capture.ts`, `browser._installNetHook`). DeepSeek renders the
answer (markdown+LaTeX) and distorts the arguments: the dollar sign in formulas
is lost, escaped newlines become real, names are auto-linked. The interception
returns the raw text from SSE/JSON. Answers are written to ~/.zames/net-log
ONLY when the debug env flag `ZAMES_NET_DEBUG=1` is set (`dumpNetBody`); by
default nothing is dumped (thousands of files / tens of MB otherwise).
Additionally the interception yields the chat id earlier than it appears in the
URL (browser._netChatId is used in getCurrentChatId as a fallback).
Details — in the comments of src/net-capture.ts and src/browser.ts.

The SAME interception also captures the CONTEXT SIZE: DeepSeek sends
`accumulated_token_usage` (a cumulative token counter for the whole chat) in
the SSE stream (`v.response.accumulated_token_usage` and BATCH updates).
`extractTokenUsage(body)` (src/net-capture.ts) returns the latest value;
`browser._lastTokenUsage` (exposed via `getLastTokenUsage()`) is updated in
`_onResponse` and from `fetchChatMessages` (every message of
history_messages carries the counter). `/cost` and `/status` print it, and
`printRestoredHistory` shows it on `/resume`. This is the closest thing to
"used context" the web UI exposes — there is no prompt_tokens/completion_tokens
like the API. We do NOT add a tokenizer dependency: the server counter is the
truth and a local BPE estimate would be wrong.

Write/Edit accept base64 variants of the arguments (content_base64,
old_base64/new_base64) — this works around channel distortions: base64 consists
only of [A-Za-z0-9+/=] and is not corrupted. The system-prompt advises the model
to use them for text with special characters.

The model returns a tool call as text. `agent-loop.ts` parses it (there is a
strict and a permissive parser). The format is described in the system-prompt.
If you add a tool — sync its description in the system-prompt.

The parser in `parseToolCall()` tries in order: a JSON object/array (including
in a ``` block and with "repaired" backslashes), permissive parsing of dirty
JSON, a tail after prose and, at the very end, an XML/DSML block
(`src/xml-toolcall.ts`). The latter is needed because the model sometimes
answers not with JSON but with
`<invoke name="Tool"><parameter name="x">…</parameter></invoke>` (the tag may
carry an arbitrary prefix) or a DSML block
`<｜｜DSML｜｜invoke name="Read">…`. Without this parsing such an answer is not
considered a tool-call, and the agent silently finishes the task — "called a
tool and stopped". If you change the answer format — update `src/xml-toolcall.ts` too.

Additional safeguards against "stalls" (verified on real transcripts):

- `repairRawControlChars()` escapes raw newlines/tabs inside JSON string
  values (`old_string`, `new_string`, `content`) — otherwise `JSON.parse`
  fails and a multiline call is not recognized;
- for `Edit` and for dirty JSON, args are parsed from the "tail" to the end of
  the text (`parseEditArgs`/`parseArgsPermissive`/`parseArgsGreedy`), because
  bracket balancing breaks on raw quotes inside strings (a common case for
  `Bash`/`Write` with code inside);
- trimming the XML/DSML tail uses `<[^>]*>` (not `<[^>]>`), otherwise
  multi-character tags (`<|DSML|invoke ...>`) are not trimmed;
- `parseInlineJsonArgs()` in `src/xml-toolcall.ts` handles the "hybrid" form:
  the tool name is an attribute AND the args are inline JSON in the SAME
  opening tag, without any `<parameter>` children. A real case from the
  transcript: `<|DSML|invoke name="GitAdd", "args" {"paths": "AGENTS.md"}>`.
  The `<parameter>` parser missed it, and the call was silently lost (the
  agent stalled). Now the first balanced `{...}` inside the tag is parsed as
  args;
- `parseToolCallPermissive()` also handles a call whose argument keys are
  INLINE with `"tool"`, with no `"args"` wrapper at all —
  `{"tool": "Bash", "command_note": "", "command": "git push ..."}}`.
  The strict parser rejects it (there is no `obj.args`), and the permissive
  one used to bail out early (`indexOf('"args"') === -1`), so the call was
  counted as malformed and re-asked; after `MAX_MALFORMED_RETRIES` the run
  stopped with the model's text as the final answer (a real "stopped after a
  tool call" case from the transcript, `git push`). Now the object's keys are
  flattened into `args` (the `tool` key is dropped);
- in `runAgentLoop()` the `looksLikeToolCall` guard kicks in: if the answer
  looks like a call (there is `"tool":`, `invoke`, `parameter`, `tool_calls`,
  `DSML`, `function_call`) but is not recognized — the model is asked to
  resend the call (up to `MAX_MALFORMED_RETRIES`) instead of finishing the task.

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
the pre-release checks. When a change is about the agent improving itself, put
the prose there, not in the README. (This file, AGENTS.md, is agent-facing and
is NOT shipped in the npm package.)

Deep root-cause write-ups and browser/terminal mechanics live in
`docs/DESIGN-NOTES.md` (C2), NOT here — AGENTS.md keeps the acting rules plus a
short summary with a pointer. DESIGN-NOTES is read on demand when you touch the
matching module, so it is not injected into every task's context.

## Dev-only commands (self-development)

Commands that only make sense while developing zames itself are DEV-ONLY:
`/improve`, `/backlog`, `/self-review`, `/self-fix`, `/self-done`, `/self-list`,
`/self-diff`, `/self-apply`. A regular user who installed the package must
never see or run them — `/improve` on an arbitrary project would edit that
project's BACKLOG.md, and `/self-review` would snapshot its `src/`.

Enforced in three places, all keyed on `devMode` (`--dev` / `config.hotReload`,
set by `npm run dev`):

- `printHelp()` omits the block unless `devMode`;
- `buildSlashCommands()` filters `isDevOnlyCommand(c.name)` out of the «/» hints
  unless `devMode`;
- the main loop, right after `/exit`, REJECTS a dev-only command with
  `msg.dev_only` when not in dev mode (hiding is not enough — a user can type
  the command by hand).

The list has ONE source of truth: `DEV_ONLY_COMMANDS` / `isDevOnlyCommand()` in
`src/commands.ts` (pure, tested). Add a new self-development command there and
the filter covers both the help and the dispatch guard.

## BACKLOG.md is gitignored

`BACKLOG.md` is the agent's own improvement-notes file. It is listed in
`.gitignore` and MUST NOT be committed: it is rewritten constantly and would
otherwise be published with every release (it was committed once by mistake).
The agent reads and edits it locally; a `git add -A` silently skips it, which
is the intended behavior.

Two commands keep it in shape. `/backlog <text>` records an idea (fresh `N<n>`
id, placed under the `P0..P3` section; an optional leading `P0..P3` sets it)
WITHOUT implementing it — deterministic, no model round-trip. `/improve`
auto-prunes after a successful run: `collapseBacklog()` drops the archived
`<details>` copy of a finished item but keeps its `### X. [x] ... done` summary
line. The collapser is tolerant of an UNCLOSED `<details>` (a real file had one,
making the whole document a single block) — it ends an archive at the next REAL
heading, not only at `</details>`. In `--dev` mode the system prompt
(`selfImprovement`) lets the model append ONE short note itself when it spots an
improvement outside the current task, and a startup warning fires past 500
lines / 60 KB.

## Talking to the operator

The operator does NOT read the model's free text. The only thing that reaches
the operator is the `message` field of the last `respond` call before the agent
stops. Therefore all text for the operator must be in that single final
`respond`: either "task done" (a report), or "cannot continue, need the
operator's decision" (a question). Calling `respond` in the middle and
splitting the report across several messages is not allowed. The rule is baked
into the system-prompt (the SILENT OPERATION section).

DeepSeek likes to add short phrases around a tool-call. The system-prompt has
an explicit prohibition (the "ONLY TOOL CALLS" block, localized via
`prompt.only_tool_calls`; plus the "NO PROSE AROUND TOOL CALLS" section), and
`runTask()` does not show pre-tool text (`onAssistantThought` is a no-op by
default and is NOT wired to the UI in src/index.ts), so only tool-calls and
the final `respond` reach the terminal.

LIMITATION (fixed in code): it is IMPOSSIBLE to remove the intermediate text
from DeepSeek's own chat output — that text is generated by the model, not by
zames. Code can only (a) forbid it via the system-prompt ("ONLY TOOL CALLS")
and (b) hide it from the operator (never print pre-tool text; strict re-ask on
plain text). Do not attempt to "clean" the DeepSeek chat programmatically.

## Deep mechanics — see docs/DESIGN-NOTES.md

AGENTS.md used to carry the full root-cause write-ups of the "agent stopped"
family, the browser answer-reading rules, the send hooks, `LineEditor` and
attachments. That history is now in **docs/DESIGN-NOTES.md** so it is not
injected into every task (progressive disclosure). Read that file when you touch
the matching module. Summary of the ACTING rules:

- **"The agent stopped after a tool call"** almost always means an UNRECOGNIZED
  tool-call format. The protection: one shared retry budget
  (`MAX_UNPARSED_RETRIES`), a structural guard (`toolsRanInTask > 0` ⇒ a
  plain-text answer is not a clean final), and the stale-echo check keyed on
  `lastTurnRanTool` (a repeat is only stale if the previous turn REELLY ran a
  tool). See DESIGN-NOTES "The agent stopped" / "Stale-echo heuristic".
- **Answer reading**: `beforeText` and the `_askOnce()` comparisons MUST read the
  RENDERED DOM (`_readLastAnswerTextCleanDom()`), never `_netCapture`; the
  capture is only a freshness signal + the raw answer to RETURN.
- **Hooks the UI relies on**: `browser.onSendStart` (spinner starts on a real
  send), `browser.onSendPause` (animated throttle countdown), `onNotice`
  (rate-limit/service text reaches the operator above the input line). All three
  are wired in `runAgentLoop()` and cleared in `runTask()`'s `finally`.
- **`LineEditor`** (src/input.ts) is a custom line editor: bracketed paste,
  Enter-after-`\` breaks the line, 3+ line pastes collapse to `[Pasted lines#N]`,
  typing repaints ONLY the input rows (`_renderInputOnly()`), long operations
  `lock()` it. Attachments: `[image#N]`/`[file#N]` markers, files land in
  `<project>/tmp`, `@path` refs are inlined into the task (60 KB/file, 200 KB
  total). No hardcoded Russian in src/input.ts / src/spinner.ts.
- **@@file-ссылки** (B5): `extractAtFileRefs()` (src/path-token.ts) finds
  `@path` at word boundaries (never `user@host` or `@Component`);
  `inlineAtRefs()` (src/index.ts) appends the file contents under
  `## Files referenced with @ in the task`.
- **Permissions** (C1): `.zames/permissions.json`, `decidePermission()` runs
  BEFORE each tool in `agent-loop.ts`; `deny` blocks, `ask` prompts the operator.

### `@file`-ссылки в задаче (B5)

`@path` в тексте задачи — это сокращение «вот этот файл». `extractAtFileRefs()`
(src/path-token.ts, чистая, без regexp) находит все ссылки: `@` учитывается
только на границе слова (начало строки или после пробела/скобки/кавычки), поэтому
`user@host.com` и `@Component` ссылками НЕ считаются. `inlineAtRefs()`
(src/index.ts) читает существующие файлы и дописывает их содержимое в конец
задачи отдельной секцией `## Files referenced with @ in the task`. Лимиты:
60 КБ на файл, 200 КБ суммарно, сверх — усечение с пометкой. Несуществующие/
нечитаемые ссылки остаются в тексте как есть (задача не падает).

IMPORTANT when editing this code: do not put "raw" control characters (CR/LF)
into string literals — only the escape sequences `\r`/`
` (in src/input.ts
control characters are assembled via `String.fromCharCode`).

## Input while the agent works (message queue)

While the agent thinks, the terminal stays live. In TTY, `LineEditor` owns
this: the input line stays in place, and everything the user types accumulates
in its buffer. On Enter, `LineEditor.onSubmit` puts the text into `pendingQueue`
(src/index.ts).

- **Esc / Ctrl+C** — abort the current generation (`browser.stopGeneration()`);
  `Ctrl+C` while idle — exit the agent.
- Queuing a message WHILE the agent runs must NOT kill the "agent is
  working" indicator. `_doSubmit()` calls `_stopDots()`/clears the status and
  then (for a queued message) starts nothing, so the spinner vanished and the
  operator could not tell whether the agent was still working. Fix:
  `_doSubmit()` restarts the animated status when `this.busy` is true (a task is
  in flight). The spinner then stays until the queued task actually begins.
- **type + Enter** — put a message into the queue; it goes to the agent right
  after the current task finishes (like "send during generation" in the
  DeepSeek web version).
- The queue is drained in `runTask()`: after the current task finishes, the
  next message goes to the agent in the same chat (`freshChat: false`,
  `sendSystemPrompt: false`). The queue may be replenished right during
  draining, so the `while (true)` loop in `runTask()` repeats until `queue`
  is empty.

The queue (`pendingQueue`) lives in the interactive `main()` loop and is passed
into `runTask()` via `opts.queue`. In one-shot mode (`--task`) the queue is empty.

The non-TTY fallback (`watchInput()` in src/index.ts) is kept for pipes: it
reads stdin in raw mode and via `ui.setPending()` shows the typed text in the
spinner line, and on Enter puts it into the queue. It is not used in a normal
interactive launch.

## Commands (main loop, src/index.ts)

- `/new`, `/clear` — new chat (reset context)
- `/sessions` — list of saved sessions (folder `~/.zames/.sessions`)
- `/resume-id <id>` — restore a session by full chat id
- `/chats` — list of recent DeepSeek chats
- `/resume <n>` — open chat #n from `/chats`
- `/chat` — current chat id
- `/cd <path>`, `/pwd` — working directory
- `/status` — session state
- `/reload` — re-read the logic modules without a restart
- `/undo`, `/undo-list` (`/history`) — revert edits
- `/transcript` — transcript file path
- `/diff [--staged]` — show the working-tree git diff
- `/cost` (alias `/usage`) — session stats from the transcript
- `/export [file]` — write the session transcript to a Markdown file
- `/doctor` — diagnose node, git, config, browser, clipboard, MCP
- commands.ts - pure helpers for /diff, /cost, /export, /doctor,
  /add-dir, /review (tested in test/commands.test.ts)
- `/add-dir <path>` — validate an extra directory
- `/compact` — DeepSeek compresses the current chat into a handover summary,
  then a NEW chat is opened with the system prompt resent and the summary
  posted as the carried-over context. Helpers `buildCompactPrompt()` /
  `buildCompactCarryover()` live in `src/commands.ts` (pure, tested); the
  command itself is in src/index.ts and reuses `browser.ask()` +
  `browser.newChat()`. The OLD-chat summary call is `agent: true` (throttled),
  the two sends into the new chat are `agent: false`.
  If the summary call fails (most often "Messages too frequent", i.e. the rate
  limit exhausted `browser.ask()`'s own retry budget), the whole compaction used
  to abort and the operator had to start over. Now the summary is retried
  `COMPACT_SUMMARY_ATTEMPTS` (3) times with a growing pause, and if it still
  fails a LOCAL fallback summary is built from the restored chat history
  (`fetchChatMessages` + `trimRestoredMessages` + `formatRestoredHistory`, the
  same displayable dialogue /resume prints, last `COMPACT_FALLBACK_LIMIT` = 40
  messages). The compaction therefore ALWAYS completes — a rate limit only
  downgrades the summary quality, it does not lose the context.
  A SEPARATE failure mode: the summary prompt is sent into the OLD chat as a
  normal turn, so in reasoning mode DeepSeek answered it with a Bash TOOL CALL
  ("gather the current state") instead of prose — the answer was protocol noise
  that would have been carried into the new chat (the new chat would re-run an
  old command). `isUsableCompactSummary()` (src/commands.ts, pure/tested)
  rejects tool-call JSON, DSML, `"args": {`, `<ds_safety>` and the abort
  sentinel; an unusable answer is retried with an explicit "plain text only"
  note appended, and if it still fails the LOCAL history fallback is used.
  The `buildCompactPrompt()` text itself now also says "reply with the summary
  text ONLY; do NOT call tools / output tool-call JSON or DSML".
- `/review [focus] [--staged]` — the agent reviews uncommitted changes
- `/config` — view and edit settings (see "Configuration")
- `/config lang <ru|en>` — switch the interface and agent language
- `/debug-dom` — save the page HTML (selector debugging)
- `/skills` — list discovered skills (SKILL.md)
- `/memory` — show AGENTS.md / MEMORY.md files in effect
- `/init [--force]` — the agent analyzes the project and writes AGENTS.md
  (via the Write tool, like Codex's /init); `--force` overwrites an existing file
- `/help`, `help` — help
- `/exit`, `/quit` — exit

Custom commands and skills appear in the «/» hint list and in `/help`
(dynamic entries from refreshDynamicCommands).

Self-review:

- `/self-review [focus]` — snapshot src/ + review; after this you are IN the snapshot
- `/self-fix <name> [focus]` — return to an existing snapshot
- `/self-done` — leave review mode
- `/self-list` — list snapshots
- `/self-diff <name>` — differences between the current src/ and a snapshot
- `/self-apply <name>` — apply a snapshot to src/ (with a backup)

## Project context: AGENTS.md / MEMORY / skills / commands (src/context.ts)

Borrowed from Codex (AGENTS.md) and Claude Code (CLAUDE.md + skills). Loaded
by `loadProjectContext(workdir)` and injected into the system prompt by
`renderContextSection()` (src/system-prompt.ts). All reads are best-effort —
a missing/broken file never breaks the loop.

What is loaded, in priority order:

- **AGENTS.md** — project instructions. Global: `~/.zames/AGENTS.md` and
  `~/.claude/CLAUDE.md`. Project: every `AGENTS.md` on the path from the
  filesystem root down to `workdir` (the deepest wins). File names are
  matched case-insensitively (`AGENTS.md` / `agents.md`).
- **MEMORY.md** — durable notes that survive sessions. Global:
  `~/.zames/MEMORY.md`, `~/.claude/MEMORY.md`; project: up the chain like
  AGENTS.md. The prompt tells the agent to append durable facts via Edit/Write.
- **skills** — `SKILL.md` files, discovered up to 3 levels deep under
  `<workdir>/.zames/skills`, `.claude/skills`, `.agents/skills`, `skills`,
  plus `~/.zames/skills` and `~/.claude/skills`. Only the YAML frontmatter
  (`name`, `description`, optional `allowed-tools`, `user-invokable`) goes
  into the prompt — the body is read on demand (progressive disclosure).
  Project skills override global ones with the same name.
- **custom commands** — `.md` files under `.zames/commands`, `.claude/commands`,
  `.agents/commands`, `~/.zames/commands`, `~/.claude/commands`. The body
  supports `$ARGUMENTS` and `{{args}}` placeholders, plus positional `$1`..`$N`
  and named `$name` tokens. Two optional frontmatter fields (B7):
  `argument-hint:` (e.g. `<file> [focus]`) is shown in the «/» suggest list and
  `/help` as a display-only `hint` on the entry (NEVER inserted into the input
  line), and `arguments:` declares mandatory positional names.

When the operator types `/<name>`, `expandSlashTarget()` (src/index.ts) looks
it up among commands (prompt template) and skills (instruction body) and turns
it into the task text. The pure helpers `splitCommandArgs()`,
`expandCommandArgs()` and `missingCommandArgs()` (src/commands.ts) do the
substitution: a command whose declared `arguments:` are not all supplied on the
command line is REJECTED with `msg.missing_args` instead of being sent.
Skills and commands also show up in the «/» completion list and in `/help`.

## Configuration (src/config.ts)

Global: `~/.zames/config.json`
Local: `<project>/.zamesrc.json`
Defaults and merging — in DEFAULTS/deepMerge. Key sections: maxIterations,
headless, debug, undo, transcript, browser, ui.

### Editing via /config

`CONFIG_SCHEMA` (src/config.ts) is the list of settings that can be changed
from `/config`. Each entry: `path` (e.g. `undo.enabled`), `type`
(boolean/number/string/enum), `labelKey`/`groupKey` (i18n keys of the label and
group), optionally `values`/`min`/`max`. The schema is the single source of
truth: `set` is validated against it, and the menu and text list are built from it.

**Labels are localized**: the schema has no English strings, only keys
(`cfg.f.*`, `cfg.group.*`) — their translations live in src/i18n.ts. So the menu
and list are always in the selected language.

The interactive menu is `runConfigMenu()` in src/config-menu.ts. It is invoked
by `/config` (without arguments) in a TTY. Controls: ↑/↓ or j/k — select, Enter —
edit (boolean/enum toggle in place, number/string prompt for input), d — reset to
default, q/Esc — quit. The menu reads keys itself and draws to stdout, so while
it runs, LineEditor is "paused" (`editor.pause()` / `editor.resume()` in
index.ts), otherwise the menu output would overlap the input line. Input is
parsed into tokens (the buffer may contain several keys: arrows+Enter) — see `onData`.

Text subcommands (for scripts and non-TTY): `/config [menu|list]`,
`/config get <path>`, `/config set <path> <val>`, `/config reset <path>`,
/config path, /config lang <ru|en>. Values are written to the home
config ~/.zames/config.json, NOT the project .zamesrc.json (personal
toggles such as browser.auth.* must not leak into git and change defaults
for other users; .zamesrc.json is ignored by git for the same reason).
Writing does not freeze defaults into the file. After a change the runtime
config object is updated - the value takes effect immediately.
(the section interface), an entry to `CONFIG_SCHEMA` (with `labelKey`/`groupKey`)
and the corresponding keys to the i18n `CATALOG`. Do not add secrets and values
that require a restart (transcript.dir, browserChannel) to the schema.

### Localization (src/i18n.ts)

`Locale = 'ru' | 'en'`. Interface strings are in the `CATALOG`
(key → `{ ru, en }`), accessed via `translate(locale)(key, params)`.
The current language is stored in `config.ui.locale`, changed by
`/config lang <ru|en>` (and `/config set ui.locale en`).

What is localized:

- `printHelp()`, slash-command hints (buildSlashCommands in index.ts);
- main-loop service messages, `/status`, `/config`;
- spinner phrases (`createSpinner(locale)` / `randomThinkingPhrase(locale)`);
- **the agent's answer language** — via the system-prompt: `buildSystemPrompt({ locale })`
  adds the LANGUAGE section (`prompt.answer_language`), where the model is told
  to answer the operator in the selected language. `runAgentLoop` passes `locale`
  into `buildSystemPrompt`.

When the language changes on the fly: `currentLocale` in index.ts is updated,
the editor rebuilds the hints (`editor.setCommands`), and `config.ui.locale` —
so that the next task goes with the new language in the system-prompt. Add new
strings to `CATALOG` (both languages) — the test `test/i18n.test.ts` checks that
ru/en are present.

`browser.minSendIntervalMs` (15000 by default) — the minimum pause between
sends to [chat.deepseek.com](https://chat.deepseek.com/). DeepSeek limits the rate
("Messages too frequent. Try again later."), so `_waitForSendSlot()` in
`browser.ts` waits before every send until this interval has passed since the
previous one (`_lastSentAt`). The first send in a session does not wait, and
the system-prompt send is `agent: false` (it opens a fresh chat, so throttling
it only added a useless 15s pause at the start).

`browser.stabilityChecks` / `browser.stabilityDelayMs` (2 x 400ms by default)
— the final "the answer has settled" loop in `_askOnce()`: the answer is
returned after `stabilityChecks - 1` stable ticks spaced by `stabilityDelayMs`.
Both are honored (they used to be dead config with a hardcoded 800ms tick).

`browser.deepThinking` / `browser.webSearch` (false / true by default) —
DeepSeek chat toggles ("Deep thinking" / "Smart search"). `_applyToggles()`
in `browser.ts` is called in `_askOnce()` right after the send-pause, BEFORE
the text is typed, and clicks the toggle only when `aria-pressed` differs
from the configured state (so a manual flip by the operator is not undone).
The reasoning text is never read: `_readLastAnswerText()` skips elements
inside `.ds-think-content`, and `net-capture.ts` already ignores
`reasoning_content`/thinking chunks.

`browser.maxIncompleteRetries` / `browser.incompleteWaitMs` (4 / 2000ms by
default) — retries for a turn the SERVER truncated. With the reasoning
("Deep thinking") toggle ON, DeepSeek frequently cuts a turn short: the SSE
stream ends with `quasi_status: INCOMPLETE` and
`finish_reason: generation_err` ("Server is temporarily unavailable") and the
web UI shows a **Continue** button. The DOM keeps the partial (often the
previous) answer, so before this fix the finish loop in `_askOnce()` waited
out the whole `answerTimeoutMs` and threw `ds.send_no_new_answer` — to the
operator it looked like "the agent stopped with a Continue button in the chat",
and it happened only with thinking ON (the long THINK phase makes truncation
far more likely). Now `isGenerationIncompleteText()`
(`src/browser.ts`, matched against the raw `_netCapture` SSE body) recognizes the
truncated turn in BOTH the start-wait and the finish loop, throws
`GenerationIncompleteError`, and `ask()` resends the SAME prompt into the same
chat (what the Continue button does) up to `maxIncompleteRetries` times. The
retry does NOT consume a regular `askRetries` attempt. After the budget is
exhausted the operator gets `ds.incomplete_give_up` (which suggests turning the
reasoning mode off).

`browser.autoContinue` (true by default) — click DeepSeek's **Continue** button
automatically. With the reasoning toggle on the server also CAPS the THINK
phase (a long reasoning turn pauses mid-way and shows Continue); the model does
NOT resume by itself, so the turn used to sit idle until the operator pressed
Continue by hand. `_clickContinueIfVisible()` (src/browser.ts) is polled in BOTH
`_askOnce()` loops; it matches the button's accessible name against
`CONTINUE_NAME_RE` — a bare continue word OR the same word plus a short
reasoning/answer suffix. In reasoning mode DeepSeek labels the button
«Продолжить размышление» / «Continue thinking» (NOT a bare «Continue»), so the
old EXACT list (`Continue`/`Продолжить`/`Продолжение`) MISSED it: the button was
never found and the operator had to press it by hand. The regex is anchored and
length-limited, so a "Continue" inside rendered prose is never clicked (the old
non-exact `getByRole` matched any button CONTAINING the word). The click is a
TRUSTED Playwright click (`getByRole('button', { name: CONTINUE_NAME_RE }).click()`),
with a raw-DOM fallback (`pointerdown`→`mousedown`→`pointerup`→`mouseup`→
`click`) for a build without a proper role. The OLD code only did the in-page
`e.click()`/dispatchEvent, which DeepSeek's React button IGNORED — the operator
saw the button and the "жму Continue" message, but the turn never resumed. A
live fixture check confirmed `getByRole('button')` matches DeepSeek's
`div[role=button]` and the trusted click fires the handler. `_continueButtonVisible()`
uses the SAME regex, so the paused-turn guard is not blind in reasoning mode
either. Covered by `test/continue-button.test.ts`.

THROTTLE: a Continue click sends a `chat/continue` request and hits the rate
limit just like a normal send, so it must NOT fire back-to-back. A run that
keeps getting truncated could otherwise hammer it. `_clickContinueIfVisible()`
clicks AT MOST once per `continueMinGapMs` (default **1500ms**), measured from
the LATEST of `_lastSentAt` and `_lastContinueAt` (a new field). The gap is
DELIBERATELY smaller than `minSendIntervalMs` (15s): the reasoning button
appears immediately when the THINK phase is capped, and waiting out the full
send interval before each click made every resume feel sluggish (the operator
saw a frozen turn for ~15s). Set `browser.continueMinGapMs` to tune it. The
button is looked up FIRST and the slot is waited out only when it is actually
present, so probing every tick stays cheap. A normal send updates
`_lastSentAt`; a Continue click updates `_lastContinueAt`.

ORDER MATTERS: the Continue button RESUMES the SAME turn (a `chat/continue`
request); resending the prompt creates a NEW turn and duplicates the work. So
whenever a truncated turn (`generation_err` / `INCOMPLETE`) or a
finished-without-answer turn is detected, the code FIRST tries
`_clickContinueIfVisible()` and only throws `GenerationIncompleteError` (which
makes `ask()` resend) when there is no button to click (or `autoContinue` is
off). Set `browser.autoContinue: false` to disable the auto-click.

IMPORTANT: a PAUSED generation also looks "settled" (the answer text stops
changing while Continue is on screen), so the finish loop's stability check
(`stable >= stabilityChecks - 1`) used to RETURN the partial answer right there —
the "agent stopped with a Continue button" symptom survived the first
`_clickContinueIfVisible` fix because the early-return fired before the click
mattered. `_continueButtonVisible()` is therefore checked BEFORE the settled
return in the finish loop and in the start-wait's SETTLED branch: while Continue
is visible the answer is NOT accepted — the loop clicks Continue and keeps
waiting. When the start-wait sees Continue it clicks it (the button appears
before any RESPONSE text, so the wait would otherwise spin to the deadline).

### "Stopped" in the browser: a FINISHED turn with no answer

A SECOND Continue case, distinct from `generation_err`: DeepSeek can END a
reasoning turn with `quasi_status: FINISHED` but produce **only a THINK
fragment and no RESPONSE fragment at all**. The web UI shows the status
**Stopped** plus a Continue button, while the DOM keeps the reasoning/previous
text. `extractAnswer()` returns `''` (it only collects RESPONSE fragments), so
`_netCapture` stayed empty, `_netCaptureAt` was NOT refreshed, and the finish
loop waited out the whole `answerTimeoutMs` and threw `ds.send_no_new_answer` —
the operator saw the agent hang on "Stopped" with a spinning terminal.
`isGenerationIncompleteText()` does NOT catch this (status is FINISHED, not
INCOMPLETE), which is why the earlier fix missed it.

Fix: `isFinishedWithoutAnswer(body)` (src/net-capture.ts) detects
`quasi_status: FINISHED` with no non-empty RESPONSE fragment; `_onResponse`
sets `browser._netNoAnswer` (with a fresh `_netCaptureAt`) for such a body from
a `chat/(completion|continue)` URL. Both `_askOnce` loops then CLICK Continue
and keep waiting (and, if Continue cannot be clicked, the finish loop throws
`GenerationIncompleteError` so `ask()` resends the prompt — the same thing the
button does). The flag is reset before every send. Verified against real
captures: exactly the one body that hung the live agent is flagged, with zero
false positives across 2118 bodies. Covered by
`test/generation-incomplete.test.ts`.

#### "Stopped" with NO Continue button

DeepSeek can also show **Stopped without any Continue button**. In that case
there is nothing to click, so waiting out the timeout is pointless. Both
`_askOnce` loops now treat a truncated (`generation_err`/`INCOMPLETE`) OR a
finished-without-answer turn as "dead" the moment Continue is absent (or
`autoContinue` is off): they throw `GenerationIncompleteError` immediately and
`ask()` resends the prompt. Previously only the INCOMPLETE case threw; the
finished-without-answer case spun until the full timeout.

#### CRITICAL: the detectors must read the RAW body, not `_netCapture`

The incomplete/no-answer detectors were guarded on `this._netCapture &&` — but
BOTH failure modes (generation_err/INCOMPLETE, and FINISHED-with-only-reasoning)
have NO RESPONSE fragment, so `extractAnswer()` returns `''` and `_netCapture`
is EMPTY. The guard was therefore dead code: the check never fired, and the
agent hung on "Stopped" until the timeout (this is exactly why the earlier
2.29.2/2.29.3 fixes did not help the live agent).

Fix: `_onResponse` stores the RAW SSE body of the current answer in
`browser._netBody` (completion/continue URLs only, kept even when there is no
RESPONSE text) and refreshes `_netCaptureAt`. All four detector call sites
(start-wait + finish-loop, incomplete + no-answer) now run on `_netBody` /
`_netNoAnswer` and are NOT gated on `_netCapture`. `_netBody` is reset before
every send alongside the other capture fields. A regression test feeds a real
truncated body (extractAnswer() === '') and asserts the detector still fires.

## Headless by default + login (src/browser.ts)

`headless` is **true by default** (DEFAULTS in config.ts). `--headed` (or
`headless: false` in the config) shows the browser window for manual sign-in
and selector debugging. `--headless` is kept as an explicit override.

### Why headless "could not log in" while headed worked (fixed)

A headless Chromium advertises `HeadlessChrome/<v>` in its User-Agent, and
DeepSeek's CDN (CloudFront/WAF) answers that UA with a plain `403 ERROR` page
BEFORE the app is served. A headed window sends `Chrome/<v>` and loads fine.
So the SAME login worked headed and silently failed headless — the operator
saw "headed logs in, headless doesn't". This was NOT a bug in the login
selectors.

Fix: `DeepSeekBrowser.launch()` calls `_fixHeadlessUserAgent()` right after
the first launch. It reads the real UA from the page (`navigator.userAgent`),
and if it carries the `Headless` marker, closes and relaunches once with
the marker removed via the `userAgent` launch option (`sanitizeHeadlessUA()`,
exported and unit-tested). Only the marker is stripped; the real engine
version is kept. An explicit UA passed in the options/config wins and is
never touched. When adding browser-launch logic, keep this in mind: any
headless run must not send a `HeadlessChrome` UA to chat.deepseek.com.

`DeepSeekBrowser.waitForLogin()` handles the DeepSeek session in layers:

1. `isLoggedIn()` — the persistent profile (`~/.zames/profile`) still has a
   valid cookie → nothing to do;
2. `_autoLogin()` with `browser.auth.username` / `browser.auth.password` from
   the config → the "logged out but credentials are known" case;
3. `_promptAndLogin()` — in a TTY, ask the operator for login (normal
   readline question) and password (raw keystroke reading, echoed as `*`,
   `askPassword()`), try them, and on success call `onAuthSave` so index.ts
   persists them with `writeConfigValue('home', …)` (the browser module never
   writes the config itself). `askPassword()` reads stdin in raw mode instead
   of readline because readline's echo (`_writeToOutput`) cannot be reliably
   muted from outside — that bug made the password step hang; it echoes one
   `*` per char and handles Backspace/Ctrl+C/Ctrl+D.
4. a manual hint (`auth.manual_hint` / `auth.manual_hint_headless`) and a
   final `isLoggedIn()` wait after Enter.

The password field in `/config` is shown masked (`********`) in the menu, the
text list, and `/config get`. `_persistSessionIfNeeded()` writes a marker
`~/.zames/auth.json` after a successful login; `/doctor` reports it as the
`auth` row (`renderDoctor({ authSaved })`). Login DOM selectors live in
`PASSWORD_SELECTORS` / `LOGIN_SELECTORS` / `LOGIN_SUBMIT_SELECTORS` at the top
of browser.ts; the login field is found by the closest preceding text input
when no explicit selector matches.

Data in `~/.zames`: profile (browser), logs (transcript), undo, snapshots,
`.sessions` (sessions/chats), `auth.json` (session marker). Temp files —
`<project>/tmp` (in .gitignore, cleaned on launch).

## Sessions (src/sessions.ts)

So that context is not lost after a restart, each session (a DeepSeek chat id)
is saved as a separate JSON file in `~/.zames/.sessions/<id>.json`:
`{ id, title, workdir, createdAt, updatedAt }`. The `last.json` index stores
`byWorkdir` (the last session for each working directory) and a global `last`.

On startup `main()` restores the last session **for the current working
directory** (`loadLastSession(workdir)`), unless `--new-chat` or `--chat <id>`
is passed. This replaces the former single `last-chat.json`, which got lost when
the project changed and gave no list to restore from.

API: `saveSession`, `loadLastSession(workdir)`, `readSession(id)`,
`listSessions()`, `sessionsDir()`. Saving is called from `saveLastChat()` in
`index.ts` after every task, new chat and `/resume`.

### System-prompt on resume (`browser.resendPromptOnResume`)

When a chat is resumed, its start already contains the system-prompt, so
resending it is WASTEFUL and pollutes the context (a resumed chat grew a
system-prompt every `--resume-last`/`/resume`, ~65k chars each — the history
dump had NINE copies). By default the system-prompt is therefore NOT resent on
resume: `promptOnResume()` (src/index.ts) returns `false` unless
`--resend-prompt` is passed or `browser.resendPromptOnResume` is true (set it
when the prompt/tools changed and the model must see them). This matches the
one-shot path, which already defaulted to not resending.

### Printing the restored dialogue

When a chat is restored (`/resume <n>`, `/resume-id <id>`, or the automatic
startup restore), the whole visible dialogue is printed into the terminal so
the operator sees the context instead of a bare "Chat opened.".
`DeepSeekBrowser.fetchChatMessages(id)` (src/browser.ts) is tried FIRST: it
fetches `/api/v0/chat/history_messages?chat_session_id=<id>` from INSIDE the
page and reads `data.biz_data.chat_messages[]`, keeping REQUEST fragments
(user) and RESPONSE fragments (assistant) — THINK/FILE fragments are skipped.
This returns the WHOLE history, while the rendered page virtualizes long
chats.

IMPORTANT: that endpoint needs an `Authorization` header (DeepSeek's app
reads a token from its own storage and sets it explicitly). A bare `fetch`
does NOT get it — the request answers 401/empty. So `_installNetHook()` also
listens to `page.on('request')`, sniffs `authorization` / `x-ds-pow-response`
off real `deepseek.com/api/` requests into `_apiAuth` / `_apiPow`, and
`fetchChatMessages` replays them (waiting up to ~3s for DeepSeek's own
history request to fire on a freshly opened chat). Cookies alone are not
enough.

If that fails, `DeepSeekBrowser.readChatMessages()` scrapes the DOM
best-effort: message containers are matched loosely
(`div[class*="ds-message"]` / `chat-message` / `message-item`), the role is
taken from the `ds-assistant-message-*` / `ds-markdown` class (everything else
is a user turn), and `.ds-think-content` (reasoning) is skipped — same rule as
in `_readLastAnswerText()`. If no message containers are found, it falls back
to the assistant-only `ANSWER_SELECTORS`.

The rendering is split in two: `trimRestoredMessages()` and
`formatRestoredHistory()` (src/commands.ts) are pure and unit-tested (see
`test/commands.test.ts`), while `printRestoredHistory()` (src/index.ts) does
the actual output via `editor.printAbove()` (or `console.log` before the
editor exists) and `renderMarkdown()`. Only the last
`RESTORED_HISTORY_LIMIT` (20) messages are shown.

IMPORTANT: DeepSeek stores each assistant turn VERBATIM — either a raw
tool-call JSON (`{"tool":"Read","args":{...}}`, often dirty/truncated) or a
`respond` call carrying the real message for the operator
(`{"tool":"respond","args":{"message":"..."}}`). Before, the filter simply
dropped anything matching `"tool":` — which dropped the REAL answers too, while
tool-call noise leaked through, so the restored dialogue showed garbage.
`normalizeRestoredMessage()` (src/commands.ts) now: for USER, drops the
protocol noise (system-prompt, `Tool result for …`, nudges); for ASSISTANT,
UNWRAPS a `respond` call to its `message` (via `parseAssistantToolCall()`,
tolerant of dirty JSON — a stray `}}`, a broken head), DROPS any other
tool-call, keeps plain-text answers, and drops the model's `<ds_safety>` block.
`trimRestoredMessages()` applies this and keeps the last 20 messages.
`isDisplayableMessage()` is now a thin wrapper over `normalizeRestoredMessage()`.
`readChatMessages` / `fetchChatMessages` are optional in `BrowserLike`, so test
doubles and self-review are unaffected. The feature is best-effort: a
fetch/scraping failure never breaks the restore. When nothing is printed,
`fetchChatMessages` stores its failure reason in `browser._lastHistoryError`,
which `printRestoredHistory()` shows (and `--debug` prints the
`[history] chat=... raw=... shown=... err=...` line). A chat that contains
ONLY tool-calls yields "service only" — that is expected, not a bug.

## Other modules

- `theme.ts` — output palette (chalk)
- `spinner.ts` — the "agent is working" spinner (random phrases)
- `markdown.ts` — rendering the model's answers
- commands.ts - pure helpers for /diff, /cost, /export, /doctor,
  /add-dir, /review (tested in test/commands.test.ts)
- `diff.ts` — showing diffs
- `undo.ts` — backups/revert
- `transcript.ts` — transcript writing
- `self-review.ts` — snapshots and self-review

## Verifying changes

### Agent self-smoke (a real isolated instance)

`npm run self-smoke` (scripts/self-smoke.mjs) launches a REAL zames instance in
an ISOLATED profile and exercises the core functionality end-to-end against
live DeepSeek, then prints PASS/FAIL per scenario. Use it to check your own
build BEFORE a final commit — it catches integration regressions (login, tool
calls, attachments, send) that unit tests cannot.

Isolation matters: the script sets a THROWAWAY `HOME` (via `ZAMES_SMOKE_HOME`)
BEFORE importing any project module, copies the real `~/.zames/config.json` so
auto-login works, and symlinks the real Playwright browser cache. It NEVER
writes to the operator's `~/.zames/profile` and can run alongside a live agent.
Flags: `--headed` (visible window), `ZAMES_SMOKE_KEEP=1` (keep the temp HOME).
Scenario failures are reported, not thrown; exit code 1 means at least one
failed. When you add a user-visible feature, add a self-smoke scenario for it.

- Syntax/types: `npm run typecheck` (tsc --noEmit, includes test/)
- Tests: `npm test` (tsx --test test/*.test.ts); watch — `npm run test:watch`
- Build: `npm run build` (tsc -p tsconfig.build.json → dist/, no sourcemap)
- Run (prod): `npm start` (node dist/index.js) or `zames`
- Run (dev, no build): `npm run dev` (tsx src/index.ts, HEADED by default
  so the DeepSeek window is visible while developing)
- Test framework: the built-in `node:test` + `tsx` (see `test/*.test.ts`).

## TypeScript

The project is in TypeScript, strict. Sources — `src/*.ts`; the build is `tsc`
into `dist/` (`bin.zames` and the npm publication point to `dist/index.js`,
`files: ["dist", …]`). `prepublishOnly` builds before publishing.

Two configs: `tsconfig.json` (IDE + `npm run typecheck`: noEmit, includes src/ and
the test/ tests; allowImportingTsExtensions) and `tsconfig.build.json` (only src →
dist, sourceMap: false).

Imports in the code use the `.js` extension (NodeNext), even in `.ts` files:
`import { theme } from './theme.js'`. That is what moduleResolution NodeNext requires.

Contracts (tool-call, ToolDef, config, BrowserLike) — in `src/types.ts`.
If you change a tool or the tool-call format — sync the types there.

Hot-reload (`/reload`, `--dev`) dynamically imports modules with `?t=timestamp`.
In prod mode these are `dist/*.js`, in dev — `src/*.ts` via tsx (tsx resolves `.js`→`.ts`).

IMPORTANT: only the modules in `RELOADABLE` (src/index.ts) are hot-reloaded —
`agent-loop`, `system-prompt`, `tools`, `extraTools`, `config`, `gitTools`,
`web`, `self-review`, `diff`, `undo`, `transcript`, `spinner`, `mcp`.
**`browser.ts` is NOT in the list and is imported statically ONCE**: the live
`DeepSeekBrowser` instance owns the Playwright context/page/timers, so a hot
swap is unsafe. Consequence: in dev mode (`npm run dev` = tsx over `src/`) an
edit to `browser.ts` does NOT take effect until the process is RESTARTED — a
fix can silently "not work" while an old copy runs in memory. To make this
non-silent, dev mode watches `browser.ts`'s mtime and prints a ONE-TIME warning
(`reload.browser_restart`) when it changes. `dist` does not need rebuilding for
dev (tsx reads `src/`), but the process must be restarted.

Self-review looks for the directory with the `.ts` sources: in dev it is `src/`,
in the built `dist/` — `../src` (`resolveSrcDir()` in self-review.ts). The
published package contains only `dist/`, so /self-review will not work there.

## Why the agent may "stall"

The exit point from runAgentLoop() without running a tool is an answer that
parseToolCall() could not recognize (parsed === null). Such an answer is taken
as the model's final text, and the loop ends. Therefore "stalls after a tool
call" are almost always an unrecognized tool-call format (DSML/XML, dirty JSON,
prose around it).

The protection has three layers: 0. `parseToolCall()` collects EVERY recognized call, not just one: if the model
emits several separate `{"tool": ...}` objects (or a mix with an array) in a
single answer, all of them are returned and executed. Returning only the
first used to drop the rest, leaving the agent "stalled after a tool call"
with pending work.

1. `parseToolCall()` tries JSON, permissive parsing, XML/DSML
   (`src/xml-toolcall.ts`) and, as the last fallback, `repairToolCallPreamble()`
   — repairing a "broken call head" (`<｜tool": ...`, `tool": ...`,
   `**tool**: ...`). The fallback runs ONLY after regular parsing, otherwise it
   is easy to corrupt valid JSON (an array of calls starts with `[`, containing
   `{"tool":`).
2. If the answer is still not recognized but LOOKS like a call, `runAgentLoop()`
   does not finish the task; it sends the model a corrective message and
   continues the loop (up to `MAX_MALFORMED_RETRIES` times). The detector is
   extracted into the exported `responseLooksLikeToolCall()`
   (src/agent-loop.ts) and covered by the test `test/guard-toolcall.test.ts`.
   It catches: `"tool":`, `tool":` without a quote, `**tool**:`, XML/DSML, and
   also **truncated** calls (start with `{`/`[`, have an argument key, but no
   closing bracket). Ordinary prose with `path:`/`command:` (without a leading
   bracket) is NOT touched by the detector.

A real stall case (transcript 2026-09-22): DeepSeek returned
`<｜tool": "Bash", "args": {"command": "...` — the opening `{` and the first
quote of the key were lost, and the answer broke off at ~400 characters. The
old detector did not see `tool":` without a quote/bracket before the word and
took it as final — the agent stalled. Now this is caught, and the call is
repaired.

When extending the answer formats, add parsing to `parseToolCall()` instead of
relying on the model always returning clean JSON.

## Releasing a new version

The release is published to npm automatically: the GitHub Actions workflow
`.github/workflows/publish.yml` triggers on a `v*` tag push and runs
`npm publish`. There is no need to run `npm publish` manually.

Order:

1. Run `npm run release patch|minor|major` (see below). It validates a clean
   tree, runs the gates, bumps `version` in `package.json`, writes the dated
   `CHANGELOG.md` section from the conventional commits, commits
   `chore: release X.Y.Z` and creates the tag. It does NOT push.
2. Push the branch AND the tag (`git push` + `git push origin vX.Y.Z`).
   It is the tag push that triggers the pipeline and the npm publication.

(`scripts/release.mts`, `npm run release`, BACKLOG G4 — added later. It can
also be done by hand exactly as steps 1-2 above describe.)

Pipeline requirements: the `NPM_TOKEN` secret in the repository settings.

To check the result: the Actions tab on GitHub and the package page on npm.

### Trigger phrases

When the operator says something like "подними версию", "выпусти версию",
"сделай релиз", "release", "bump the version", "cut a release" — they mean the
FULL flow above, and you must do it yourself without asking for each step:

1. choose the bump (patch/minor/major) from the nature of the changes since the
   last tag (bug fix → patch, new feature → minor, breaking change → major),
2. bump `version` in `package.json`,
3. commit everything (code + version) with `chore: release X.Y.Z`,
4. create the tag `vX.Y.Z`,
5. push the branch AND the tag (`git push` + `git push origin vX.Y.Z`).

Do NOT run `npm publish` — the tag push triggers the GitHub Actions pipeline
(`.github/workflows/publish.yml`) which publishes to npm. After the push, tell
the operator the new version and that CI will publish it; to verify, point them
to the Actions tab and the npm package page.
