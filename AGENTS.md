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
   model. Up to `maxIterations` iterations (40 by default).
3. `src/browser.ts` — all Playwright work: finding the input field, inserting
   text (a paste event for contenteditable), waiting for the answer, reading
   the answer, Stop/Esc, determining the current chat id, listing chats.
4. `src/system-prompt.ts` — builds the system-prompt (tool descriptions,
   working directory, git context).
5. `src/tools.ts`, `src/gitTools.ts`, `src/web.ts` — tool implementations.

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

## tool-call format

IMPORTANT: the model's answer is read NOT from the DOM but by intercepting the
network (`src/net-capture.ts`, `browser._installNetHook`). DeepSeek renders the
answer (markdown+LaTeX) and distorts the arguments: the dollar sign in formulas
is lost, escaped newlines become real, names are auto-linked. The interception
returns the raw text from SSE/JSON. Answers are written to ~/.zames/net-log.
Additionally the interception yields the chat id earlier than it appears in the
URL (browser._netChatId is used in getCurrentChatId as a fallback).
Details — in the comments of src/net-capture.ts and src/browser.ts.

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

## "The agent stopped" — root cause and fix

The old loop had FIVE separate retry counters for a non-call answer
(malformed=3, stall=5, looksDone=3, plainText=5, afterTool=6). One stuck
answer therefore burned ~20 iterations and then returned a useless
"iteration limit" stub — the "agent stopped / just stands there" symptom. Two
more bugs fed it:

1. **respond mixed with a tool call.** DeepSeek sometimes returns
   `[{"tool":"Edit",...},{"tool":"respond",...}]` in ONE answer. The loop
   handled `respond` first and DROPPED the other call — the tool never ran
   and the agent looked stopped right after a tool call. Fix: `respond` only
   finishes the task when it is the SOLE call; otherwise the real tools run
   first (`callsToRun = realCalls.length > 0 ? realCalls : calls`).
2. **Empty / meaningless respond.** `respond` with `message: ""` (or `"..."`)
   at the exhausted-retry limit used to return an empty string, i.e. a silent
   finish. Fix: `isMeaningfulRespond()` rejects empty/punctuation-only
   messages, and an exhausted empty respond WARNS the operator instead of
   returning nothing. A short `"готово"`/`"ok"` is still a valid final.

The retry budget is now a SINGLE counter, `unparsedRetries`
(`MAX_UNPARSED_RETRIES = 4`), shared by every guard and replenished after
each successful tool call. After it is exhausted the loop asks for `respond`
exactly once (`finalRespondAsked`) and then surfaces the model's own text
with one warning — never a stub, never a 20-iteration hang.

### browser.ask(): accepting an echo/stale answer

`_askOnce()` (src/browser.ts) decides that a new answer has started and
finished by comparing the page text with `beforeText` (the answer that was on
screen before the send). A legitimate answer that happens to EQUAL the
previous text (DeepSeek frequently echoes the same line, or repeats a short
acknowledgement) made both checks fail: the start-wait threw "did not start
in 15s" (then `ask()` retried for minutes) and the finish-wait spun until the
full timeout. To the operator this looked like "the agent stopped after a tool
call". Fix: both loops now also accept the answer when the generation has
clearly SETTLED — the Stop button is gone and the text has been stable for two
ticks — even if the text equals `beforeText`. The network-capture check stays
as the strongest signal of a fresh answer.

### The spinner must start only on a real send

The "agent is working" spinner used to be started by the CALLER
(`runTask()` called `ui.thinking()` before `runAgentLoop()`, and
`runAgentLoop()` fired `onThinking()` at the top of each iteration and before
the system-prompt). That meant the spinner ran through the whole pre-send
phase — chat creation, the 15s `minSendIntervalMs` throttle pause, DOM
lookups — with no generation in flight. To the operator it looked like "a
spinner is spinning but nothing is being generated".

Fix: `DeepSeekBrowser` now exposes an `onSendStart` hook, fired in `_askOnce()`
right AFTER `_waitForSendSlot()` and the abort check (i.e. exactly when the
message is about to be typed/sent). `runAgentLoop()` wires `browser.onSendStart
= safeThinking` at the start and the caller (`runTask()` in src/index.ts)
clears it in its `finally`. The early `safeThinking()` calls were removed. The
spinner now appears only when a generation really begins, and the spinner in
all other cases (tool calls, `/chats`, browser launch) is untouched.

### A run that ends without a model answer is surfaced

`runAgentLoop()` can end without any model answer: the iteration limit
(`Достигнут лимит итераций.`) or the `ask()` watchdog (`ask() watchdog: ответ
модели не получен`). `runTask()` used to IGNORE the return value, so in those
cases no `respond` arrived, no assistant message was printed, and the operator
saw the run just "stop" after a tool call with no explanation. Now `runTask()`
checks the outcome and, when it is one of those two non-answers, prints it via
`ui.warning()` and logs `agent_no_answer`.

## Stale-echo heuristic must not drop a call that never ran

The chain of "stops after a tool call" has a SECOND root cause, in
`agent-loop.ts`. DeepSeek often echoes the previous answer verbatim, and the
loop treated ANY repeat as "stale" and nudged instead of running it. But when
the previous answer was a DSML/XML call that the STRICT parser missed (a real
case from the transcript: `<||DSML|| calls> ... <||DSML|| invoke name="Read">
<||DSML|| parameter name="args">{...}</||DSML|| parameter> ...`, where the
strict JSON parser returns null and the call never executed), the echo is the
ONLY copy of the call we can get. Discarding it as "stale" burned the watchdog
budget and produced the "agent stopped after a tool call" symptom.

The stale check now keys off `lastTurnRanTool` — did the PREVIOUS turn ACTUALLY
execute a tool? If yes, a repeat is a stale echo (do not re-run, it would
duplicate side effects). If no (we only saw text that looked like a call but
nothing ran), the repeat is the only copy of the call and is run normally.
`ranToolPrevTurn` is a snapshot taken at the top of each iteration and cleared
immediately; `lastTurnRanTool` is set true again only when a tool really runs.

## Terminal input

Interactive input is handled by `LineEditor` (src/input.ts) — a custom line
editor, not readline. The reason: readline submits the message on the first
newline, so a multiline paste (Shift+Insert) went off immediately and only as
the first line. Current logic:
- bracketed paste is enabled (`\x1b[?2004h`), the paste text comes between the
  markers `\x1b[200~` … `\x1b[201~`;
- submission is on a single Enter; if the cursor is right after a «\», then
  Enter removes that «\» and breaks the line (behavior like in Claude Code);
  Ctrl+J, Ctrl+Enter and Shift+Enter (in terminals with the extended protocol)
  always insert a newline;
- Backspace, Ctrl+U, Ctrl+C, arrows, Home/End, Delete are supported;
- the input line is ALWAYS visible; the status/spinner and the agent's answers
  are printed ABOVE it (`printAbove`), so the typed text is not overwritten by output;
- redraw accounts for wrapping by terminal width (`layoutInput`);
- while a long operation runs (chat resume/open `/resume` `/resume-id` `/new`
  `/chats` fetch, `/self-review`) the editor is LOCKED (`editor.lock()` /
  `editor.unlock()`): text input and Enter are swallowed, so a message typed
  mid-operation is not queued and sent right after it (which used to break the
  restored session). The lock shows a status hint; Ctrl+C/Ctrl+D still pass
  through so the user can abort. The lock is released in a `finally` in
  src/index.ts around each operation; `unlock()` also clears that status
  hint (otherwise "operation in progress" stayed on screen forever after a
  fast operation like `/new`);
- large pastes (3+ lines) are collapsed in the input line into a compact
  marker `[Pasted lines#N]` (`pasteReplacement`/`formatPasteMarker` in
  src/input.ts) so a pasted log/code block doesn't flood the line. The
  original text is kept in `LineEditor.pastes` and expanded back on submit
  (`expandPastes`). Pastes of 1–2 lines are inserted as-is. The same logic is
  mirrored in `watchInput()` (src/index.ts, the non-TTY fallback).

In non-TTY mode (pipe, redirect) `LineEditor` does not start — `promptOnce()`
(src/index.ts) is used, which reads everything up to EOF.

### Attachments (images/files)

The user can paste an image or a file into the input line; it is saved under
`<project>/tmp` and shown in the line as a marker `[image#N]` (for images) or
`[file#N]` (for other files). The markers become part of the message text, so
the model sees them and the browser uploads the real files to the chat.

How it works:
- `src/attachments.ts` — pure helpers: `parseImagePaste()` detects image data
  in a paste (a `data:` URL or a bare base64 blob with a PNG/JPEG/GIF/WEBP/BMP
  magic signature), `looksLikeFilePath()`/`resolveAttachPath()` (src/index.ts)
  detect a pasted path to a local file, `saveToTemp()` writes the bytes to
  `<project>/tmp` (sanitizes the name, never overwrites — adds `-1`, `-2`),
  `AttachmentStore` numbers images and files separately and produces the
  markers. `readClipboardImageDetailed()` reads the OS clipboard and
  returns `{ data, via }`: Linux — wl-paste (Wayland) / xclip / xsel (X11),
  macOS — pngpaste, Windows — PowerShell (System.Windows.Forms.Clipboard).
  `via` names the tool used or the reason nothing was found, so a failed
  paste is never silent.

- Clipboard paste (the terminal usually delivers NO data for an image):
  `LineEditor` calls `onClipboard` on Ctrl+V (code 22) and on an EMPTY
  bracketed paste; `onClipboard` (src/index.ts) calls
  `readClipboardImageDetailed()`, saves to tmp and inserts the marker. The
  "no image" hint is shown once per session (`clipboardWarned`).
- `scripts/postinstall.mjs` installs the clipboard tool on Linux
  (xclip + wl-clipboard) through the detected package manager (apt/dnf/yum/
  pacman/zypper/apk), best-effort. Windows/macOS need no extra tool.
- `LineEditor` (src/input.ts) calls `onAttach` when a paste looks like an image
  or a file path; `onAttach` (wired in src/index.ts) saves the bytes to tmp and
  returns the `Attachment`, whose `marker` is inserted into the input line. On
  submit, `onSubmit(text, attachments)` hands the list to the queue
  (`PendingMessage`), and `runTask()` passes it into `runAgentLoop`.
- `DeepSeekBrowser._attachFiles()` (src/browser.ts) finds the hidden
  `input[type=file]` of the upload widget and calls `setInputFiles()` with the
  file buffers BEFORE the text is typed; `ask()`/`_askOnce()` accept an
  `attachments` option.
- `buildSystemPrompt()` gets an `attachments` list and adds an `## Attachments`
  section; additionally `runAgentLoop` appends a short note about the markers
  to the task message, because on a resumed chat the system-prompt is not
  resent.
- The marker numbering in `runAgentLoop`'s note is positional (image/file by
  extension) and may differ from `AttachmentStore`'s numbering; the markers in
  the task text itself are the source of truth.

If you change the marker format, update `AttachmentStore` (src/attachments.ts),
the `## Attachments` section in src/system-prompt.ts and the note in
`runAgentLoop`.

IMPORTANT when editing this code: do not put "raw" control characters (CR/LF)
into string literals — only the escape sequences `\r`/`\n` (in src/input.ts
control characters are assembled via `String.fromCharCode`).

## Input while the agent works (message queue)

While the agent thinks, the terminal stays live. In TTY, `LineEditor` owns
this: the input line stays in place, and everything the user types accumulates
in its buffer. On Enter, `LineEditor.onSubmit` puts the text into `pendingQueue`
(src/index.ts).

- **Esc / Ctrl+C** — abort the current generation (`browser.stopGeneration()`);
  `Ctrl+C` while idle — exit the agent.
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
  supports `$ARGUMENTS` and `{{args}}` placeholders.

When the operator types `/<name>`, `expandSlashTarget()` (src/index.ts) looks
it up among commands (prompt template) and skills (instruction body) and turns
it into the task text. Skills and commands also show up in the «/» completion
list and in `/help`.

## Configuration (src/config.ts)

Global: `~/.zames/config.json`
Local: `<project>/.zamesrc.json`
Defaults and merging — in DEFAULTS/deepMerge. Key sections: maxIterations,
headless, debug, confirmation, undo, transcript, browser, ui.

### Editing via /config

`CONFIG_SCHEMA` (src/config.ts) is the list of settings that can be changed
from `/config`. Each entry: `path` (e.g. `confirmation.write`), `type`
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
`/config path`, `/config lang <ru|en>`. Values are written to the **project**
`.zamesrc.json` (writeConfigValue/resetConfigValue), without freezing defaults
into the user's file. After a change the runtime `config` object is updated —
the value takes effect immediately (if it can apply without a restart).

**To add a new setting**: add the field to `DEFAULTS` and to `types.ts`
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
previous one (`_lastSentAt`). The first send in a session does not wait.

Data in `~/.zames`: profile (browser), logs (transcript), undo, snapshots,
`.sessions` (sessions/chats). Temp files — `<project>/tmp` (in .gitignore,
cleaned on launch).

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

## Other modules

- `theme.ts` — output palette (chalk)
- `spinner.ts` — the "agent is working" spinner (random phrases)
- `markdown.ts` — rendering the model's answers
- `confirm.ts` — confirmations for dangerous operations
- `diff.ts` — showing diffs
- `undo.ts` — backups/revert
- `transcript.ts` — transcript writing
- `self-review.ts` — snapshots and self-review

## Verifying changes

- Syntax/types: `npm run typecheck` (tsc --noEmit, includes test/)
- Tests: `npm test` (tsx --test test/*.test.ts); watch — `npm run test:watch`
- Build: `npm run build` (tsc -p tsconfig.build.json → dist/, no sourcemap)
- Run (prod): `npm start` (node dist/index.js) or `zames`
- Run (dev, no build): `npm run dev` (tsx src/index.ts)
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

Self-review looks for the directory with the `.ts` sources: in dev it is `src/`,
in the built `dist/` — `../src` (`resolveSrcDir()` in self-review.ts). The
published package contains only `dist/`, so /self-review will not work there.

## Why the agent may "stall"

The exit point from runAgentLoop() without running a tool is an answer that
parseToolCall() could not recognize (parsed === null). Such an answer is taken
as the model's final text, and the loop ends. Therefore "stalls after a tool
call" are almost always an unrecognized tool-call format (DSML/XML, dirty JSON,
prose around it).

The protection has three layers:
0. `parseToolCall()` collects EVERY recognized call, not just one: if the model
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
1. Bump `version` in `package.json` (semver: bug fixes — patch,
   new features — minor, breaking changes — major).
2. Commit: `chore: release X.Y.Z`.
3. Create the tag `vX.Y.Z` and push the branch and the tag.
   It is the tag push that triggers the pipeline and the npm publication.

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
