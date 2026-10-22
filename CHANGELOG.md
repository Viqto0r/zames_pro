# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.82.28] - 2026-10-22

### Fixed

- **scheduler:** render a zero interval as 0s, not 0h

## [2.82.27] - 2026-10-22

### Fixed

- **attachments:** reject a data URL with an empty payload

## [2.82.26] - 2026-10-22

### Fixed

- **context:** split a comma-separated @file list into references

## [2.82.25] - 2026-10-22

### Fixed

- **context:** pull scoped AGENTS.md for a file path in the task

## [2.82.24] - 2026-10-22

### Fixed

- **permissions:** drop a rule with an unknown condition key

## [2.82.23] - 2026-10-22

### Fixed

- **shell:** normalize the runFile timeout instead of throwing

## [2.82.22] - 2026-10-22

### Fixed

- **web:** keep table cells apart in htmlToText

## [2.82.21] - 2026-10-22

### Fixed

- **glm:** unwrap nested pagination wrappers in the chat list

## [2.82.20] - 2026-10-22

### Fixed

- **qwen:** unwrap a paginated chat-list wrapper

## [2.82.19] - 2026-10-22

### Fixed

- **glm:** unwrap a nested chats wrapper in the chat list

### Changed

- **glm:** drop guessed role fields from the history parser

## [2.82.18] - 2026-10-22

### Fixed

- **ci:** merge cache-busted coverage rows so the gate stops failing

## [2.82.17] - 2026-10-22

### Fixed

- **glm:** drop system/tool turns and read fragments on resume

## [2.82.16] - 2026-10-22

### Fixed

- **glm:** read feature flags given as an object map

## [2.82.15] - 2026-10-22

### Fixed

- **glm:** probe the send button so a missing one is a critical UI failure

## [2.82.14] - 2026-10-22

### Fixed

- **glm:** read token usage inside the chat:completion envelope

## [2.82.13] - 2026-10-22

### Fixed

- **qwen:** parse a bare-array history reply on resume

## [2.82.12] - 2026-10-22

### Fixed

- **qwen:** find an answer nested in a JSON envelope

## [2.82.11] - 2026-10-22

### Fixed

- **commands:** advertise /limits in the slash-command hints

## [2.82.10] - 2026-10-22

### Fixed

- **glm:** unwrap the chat:completion envelope in a non-streamed JSON reply

## [2.82.9] - 2026-10-22

### Fixed

- **tui:** wordRight stops at a newline instead of jumping to the next line

## [2.82.8] - 2026-10-22

### Fixed

- **mcp:** --isolated=false no longer counts as an isolated profile

## [2.82.7] - 2026-10-22

### Fixed

- **queue:** a truncated queued message keeps no lone surrogate

## [2.82.6] - 2026-10-22

### Fixed

- **config:** a numeric setting rejects a fractional value

## [2.82.5] - 2026-10-22

### Fixed

- **cost:** a non-finite duration renders as zero, not NaNs

## [2.82.4] - 2026-10-22

### Fixed

- **telemetry:** a non-finite blockMs does not poison the /limits average

## [2.82.3] - 2026-10-22

### Fixed

- **answer-parse:** a line-boundary cut never keeps a lone surrogate

## [2.82.2] - 2026-10-22

### Fixed

- **banner:** a zero content width still renders the real fields

## [2.82.1] - 2026-10-22

### Fixed

- **shell:** an empty command answers instead of throwing

## [2.82.0] - 2026-10-22

### Fixed

- **compact:** recover from an exhausted chat context on every provider

## [2.81.23] - 2026-10-22

### Fixed

- **resume:** a respond message carrying the safety block is hidden

## [2.81.22] - 2026-10-22

### Fixed

- **parser:** a tool call whose args are a JSON string is recognized

## [2.81.21] - 2026-10-22

### Fixed

- **extra-tools:** ApplyPatch Add File refuses to overwrite an existing file

## [2.81.20] - 2026-10-22

### Fixed

- **extra-tools:** MultiEdit without new_string no longer deletes text

## [2.81.19] - 2026-10-21

### Fixed

- **tools:** Edit without new_string no longer deletes the text

## [2.81.18] - 2026-10-21

### Fixed

- **tools:** Write without content no longer truncates a file

## [2.81.17] - 2026-10-21

### Fixed

- **tools:** Read past EOF explains the empty window

## [2.81.16] - 2026-10-21

### Fixed

- **i18n:** /cost describes the context counter neutrally

## [2.81.15] - 2026-10-21

### Fixed

- **web:** a search result without a snippet no longer borrows the next one

## [2.81.14] - 2026-10-21

### Fixed

- **glm:** an answer that mentions the captcha is not the captcha

## [2.81.13] - 2026-10-21

### Fixed

- **qwen:** the chat list accepts a bare array

## [2.81.12] - 2026-10-21

### Fixed

- **backlog:** a priority on its own line is still the priority

## [2.81.11] - 2026-10-21

### Fixed

- **commands:** unescapeJsonString never leaves a lone surrogate

## [2.81.10] - 2026-10-21

### Fixed

- **qwen:** the restored dialogue drops a SYSTEM turn

## [2.81.9] - 2026-10-21

### Fixed

- **commands:** a failed attachment only rewrites its own whole path

## [2.81.8] - 2026-10-21

### Fixed

- **net-capture:** a lone closing bracket is not a finished answer

## [2.81.7] - 2026-10-21

### Changed

- docs(diagram): how-it-works shows all three chat backends

## [2.81.6] - 2026-10-21

### Fixed

- **tui:** undo restores the paste body, not just its marker

## [2.81.5] - 2026-10-21

### Changed

- docs(readme): mention GLM everywhere DeepSeek and Qwen were listed

## [2.81.4] - 2026-10-21

### Fixed

- **web:** SSRF guard blocks metadata/kubernetes service aliases

## [2.81.3] - 2026-10-21

### Fixed

- **context:** allowed-tools accepts a space-separated list

## [2.81.2] - 2026-10-21

### Fixed

- **tools:** read-only mode drops concatenated/camelCase MCP writers

## [2.81.1] - 2026-10-21

### Added

- send telemetry is opt-in (on automatically in dev)

### Fixed

- **config:** mask a password in the /config set confirmation

### Changed

- apply prettier to the GLM provider and send runtime

## [2.81.0] - 2026-10-21

### Added

- auto-compact by default, GLM reasoning effort low
- **glm:** tell the model it runs on the operator's machine; fix the runtime rewrite URL match
- **glm:** neutralise z.ai's agent runtime so zames tools actually run
- **glm:** run with a visible browser by default (the site blocks headless)
- **glm:** thinking is always on and cannot be toggled off
- **glm:** verify mode flags and attach files through the upload button
- send telemetry for all providers and adaptive throttle (enabled for GLM)
- GLM (chat.z.ai) provider with anonymized recon fixtures
- browser-based login (auto-login first, headed window fallback, headless after)

### Fixed

- **glm:** force web search off and report a busy page instead of a missing button
- **glm:** no web-search noise, quota fails fast, the model is told not to browse
- **glm:** the smoke sends the system-prompt into the same chat; the mode check reads the rewritten body
- **glm:** a signed-in session is not reported as a guest
- drop the unused headless flag
- **glm:** word the mode warning accurately (the smoke passed with it on)
- persist the sign-in session cookie so it survives a restart
- a successful auto-login saves the credentials it used
- per-provider credentials are writable (missing from the config schema)
- DeepSeek signs in through the browser window before the terminal form
- the TUI login fallback prefills the active provider's credentials
- doctor renders the display row and the adaptive pause
- **glm:** report the slider captcha instead of a silent no-answer
- handoff label and live config for more than two providers
- per-provider auth marker, credentials and shared headless-UA cache

### Changed

- provider capabilities instead of qwen-only checks

## [2.80.8] - 2026-10-20

### Changed

- Internal improvements.

## [2.80.7] - 2026-10-20

### Fixed

- stop filling the disk with temp dirs, coverage dumps and unbounded logs
- word delete and word-left stop at a newline

## [2.80.6] - 2026-10-20

### Fixed

- stop filling the disk with temp dirs, coverage dumps and unbounded logs
- word delete and word-left stop at a newline

## [2.80.5] - 2026-10-20

### Fixed

- a JSON array line in a transcript is not an event

## [2.80.4] - 2026-10-20

### Fixed

- parse a bare id-keyed Qwen chat list map

## [2.80.3] - 2026-10-20

### Fixed

- a malformed uddg escape does not abort the web search

## [2.80.2] - 2026-10-20

### Fixed

- wrapToWidth keeps the indentation and inner spaces of a line
- **undo:** derive the backup name hash with sha1 instead of a path prefix

## [2.80.1] - 2026-10-20

### Fixed

- **context:** strip a leading BOM before the SKILL.md frontmatter
- **statusline:** clip a long status badge to one short row
- **diagnostics:** keep the summary inside maxChars

## [2.80.0] - 2026-10-20

### Fixed

- **commands:** keep an unsupplied  position as written in a custom command
- **subagent:** count a subagent run only once it actually starts
- **attach:** do not cut an inlined @file inside a surrogate pair
- **checkpoint:** a bare out-of-range rewind index no longer matches a stamp prefix
- **git:** split a space-separated paths argument in GitAdd
- **mcp:** keep an MCP tool result inside its size cap
- **hooks:** never cut a hook denial or notice inside a surrogate pair
- **sessions:** escape a literal underscore in the session file name

## [2.79.0] - 2026-10-19

### Fixed

- **qwen:** match the history 'from' role case-insensitively and accept human
- **browser-chats:** match the history role case-insensitively and drop service turns
- **extratools:** apply multi-hunk ApplyPatch updates and honour @@ line numbers
- **web:** drop non-http(s) links from WebSearch results
- **web:** judge 6to4 and Teredo addresses by the embedded IPv4
- **permissions:** match path rules against arrays and nested MCP args
- **scheduler:** reject empty and malformed cron field tokens
- **qwen:** read numeric and map-keyed ids in the chat list
- **xml-toolcall:** a stray brace before inline JSON no longer eats the args
- **xml-toolcall:** keep a </parameter> literal inside a parameter value
- **qwen:** detect a finished status carried on the choice, not only the delta
- **config:** reject an empty value for a number setting
- **goal:** an echoed label set is not the evaluator verdict
- **input:** expand each paste into its own marker occurrence
- **compact:** a summary that mentions DSML in prose is usable

## [2.78.3] - 2026-10-18

### Fixed

- **answer-parse:** a report narrating completed steps is not unfinished work
- **net-capture:** a short complete answer is not a finished-without-answer turn
- **git:** keep the empty-output sentinel out of the git context
- **tools:** make Read offset/limit 1-based like every line-numbered tool
- **shell:** scan a glued cd target (cd../.. escaped the sandbox)
- **web:** drop an unclosed script/style body in htmlToText
- **diagnostics:** recognize a coloured/timestamped clean banner
- **permissions:** fail closed on a rule with an invalid regex
- **transcript:** sanitize the session name in the file name
- **backlog:** strip a CR from a note title
- **shell:** escalate to SIGKILL when a killed job traps SIGTERM
- **input:** Tab on an empty buffer inserted a guessed command

## [2.78.2] - 2026-10-18

### Fixed

- **goal:** clampGoalCondition does not cut a surrogate pair
- **web:** judge the expanded IPv6 form in the SSRF guard
- **permissions:** match a command rule against an avv array
- **scheduler:** OR a restricted day-of-month and day-of-week
- **qwen:** guest-limit classifier ignores a normal answer
- **net-capture:** read a top-level accumulated_token_usage pair
- **tools:** Read does not clip a surrogate pair in half
- **tool-summary:** do not cut a surrogate pair in the log line
- **shell:** do not start a background trim on a lone surrogate
- **sandbox:** match eval at a command position, not as a substring
- **goal:** parse the spaced and hyphenated NOT MET verdict
- **hooks:** cap the combined PostToolUse and lifecycle output
- **fsutil:** write atomic files through a symlink, not over it
- **mcp:** sanitize the server half of a qualified tool name
- **statusline:** settle on our own stdout end, not on the pipe closing
- **provider:** match the handoff workdir by real path, not by string
- **checkpoint:** retention deletes same-millisecond sibling archives
- **undo:** a missing backup file no longer wedges the undo history
- **sessions:** a stale internal id no longer hides the saved session
- **attach:** keep @file references inside the sandbox root

## [2.78.1] - 2026-10-18

### Fixed

- **permissions:** match a command rule against every plausible command key
- **hooks:** cap a PreToolUse denial so it cannot flood the tool result
- **diagnostics:** treat a zero-error watch banner as clean
- **statusline:** cap the hook output so a chatty command cannot flood the row

## [2.78.0] - 2026-10-18

### Added

- **skills:** ship the methodology skills inside the package

### Fixed

- **fsutil:** remove the temp file when an atomic write fails

## [2.77.1] - 2026-10-17

### Fixed

- **backlog:** only collapse real archive blocks, not notes that mention details
- **qwen:** do not read a retry phrase in the answer as a rate limit
- **web:** block IPv4-compatible IPv6 addresses in the SSRF guard
- **sessions:** cap the input history when loading it
- **sessions:** keep chat ids with unsafe characters in separate files

## [2.77.0] - 2026-10-17

### Added

- **scheduler:** start the first /loop tick immediately

### Fixed

- **diff:** show no-changes text instead of the git runner sentinel
- **config:** refuse prototype-polluting segments in setByPath
- **net:** read the context counter from history_messages and OpenAI usage
- **agent-loop:** do not flag a report that explains the work as unfinished
- **agent-loop:** stop treating prose that mentions invoke/parameter as a tool call
- **backlog:** ignore headings inside fenced code blocks
- **subagent:** keep the SubagentStop hook output when the run fails
- **goal:** parse a markdown-formatted evaluator verdict
- **qwen:** skip the thinking phase when restoring a chat from content_list
- **changelog:** keep drafted group headings on their own line
- **tui:** decode modified and release wheel reports correctly
- **shell:** normalize an invalid Bash timeout instead of crashing the tool
- **cost:** keep per-tool stats safe for __proto__/constructor tool names
- **tui:** mark blocked/aborted tool calls as errors in the result icon
- **mcp:** do not split a surrogate pair when truncating an MCP result
- **context:** discover skills at the documented 3 levels deep
- **commands:** /diffstat accepts --staged like /diff
- **commands:** /add-dir expands a leading ~ to the home directory
- **scheduler:** accept the N/step cron form
- **scheduler:** reject a /loop interval that overflows the 32-bit timer
- **diagnostics:** never cut the check output inside a surrogate pair
- **web:** close two SSRF-guard bypasses in WebFetch
- **scheduler:** flag a job whose next fire could not be computed
- **subagent:** cap a report without splitting a surrogate pair
- **qwen:** a retry wait cut short by Esc must stop the retry chain
- **tui:** a bracketed paste split across reads must not leak its end marker
- **agent-loop:** do not cut a tool result inside a surrogate pair
- **web:** a broken numeric HTML entity must not fail the whole WebFetch
- **scheduler:** keep a scheduled message's jobId through the queue merge; explain an unrecognized /loop interval
- **tui:** localize the Ink dialog key-hint bars
- **i18n:** drop the dead /resume <n> hint from /sessions and the docs

## [2.76.0] - 2026-10-16

### Added

- bake methodology skills in, localize skill hints, fix Ctrl+Del and scroll-to-bottom

## [2.75.6] - 2026-10-16

### Added

- **tools:** AskUser — a modal question with options (and a free-text escape)
- **skills:** tell the model to check and read a matching skill before a non-trivial task

### Fixed

- **deepseek:** retry a FINISHED turn with only a truncated RESPONSE head
- **tui:** default ui.mouseScroll back to true (wheel scrolls the log)
- **tui:** default ui.mouseScroll back to false so native selection works

### Changed

- prune dead code, untrack one-off TUI probes, ship only postinstall
- **tui:** drop the unused onCopy/hint affordance from CodeBlock
- **tui:** drop the code-block copy feature (Ctrl+Y / /copy-code)

## [2.75.5] - 2026-10-15

### Fixed

- **i18n:** clearer TUI key hints; localize the scrolled status; add sched-smoke

## [2.75.4] - 2026-10-15

### Added

- **qwen:** per-model context window for the status bar and auto-compact

### Changed

- **test:** format qwen-context test with prettier

## [2.75.3] - 2026-10-15

### Fixed

- **markdown:** always apply the theme in rendered answers; rename logo-small.jpg to logo.jpg

## [2.75.2] - 2026-10-15

### Changed

- batch read-only tool calls and skip redundant checkpoints

## [2.75.1] - 2026-10-15

### Added

- remove /resume; Ctrl+Delete always deletes the word BEFORE the cursor
- **tui:** drop the working directory from the prompt
- **tui:** persistent key hint under the input box

### Fixed

- stop advertising the removed /resume and make the i18n guard real
- **tui:** Ctrl+Delete works in VSCode (it sends ESC d)
- **tui:** Ctrl+Delete deletes the word BEFORE the cursor

## [2.75.0] - 2026-10-14

### Added

- **tui:** show a one-time hint about mouse selection
- **tui:** Home/End jump to the top/bottom of the dialog
- **tui:** mouse wheel scrolls the dialog by default

### Fixed

- **tui:** the status row keeps its height (inline caret on the input row)
- **tui:** the status bar never wraps to a second line
- **tui:** the caret lands correctly in a CJK buffer
- **tui:** responsive dividers and wrapping-aware menu window
- **tui:** log scroll reads the LIVE offset (no stale closure)
- **tui:** Ctrl+Delete works (kitty CSI-u) and deletes left at end of line
- **tui:** the mouse wheel no longer scrolls the input history (for good)
- **attachments:** keep the items array identity across reset()
- **tui:** the config menu now redraws on change and fits the terminal
- **tui:** reserve the real number of rows for a wrapping suggest popup
- **tui:** exact badge width (T0.7) and honor NO_COLOR (T0.11)
- **tui:** deliver the FULL pasted text to the agent, not the [Pasted lines#N] marker
- **tui:** separate SELECT/SCROLL mouse modes and stop the header wrapping the panel

## [2.74.0] - 2026-10-13

### Added

- **tui:** interactive /chats and /sessions list menus
- **tui:** task progress bar and tool-result outcome icons (TUI-12)
- **tui:** in-TUI login and one-time-code forms (TUI-10)
- **tui:** copy code blocks (Ctrl+Y / /copy-code) and a CodeBlock widget
- **tui:** Ink-based terminal UI with full-screen mode, rich menus and mouse scrolling
- **goal:** completion-condition semantics with evaluator; make /config live

### Fixed

- **tui:** the mouse wheel now scrolls the DIALOG (not the input history)
- **tui:** window the full-screen log by rendered ROW, not by entry
- **tui:** split-safe wheel parser, empty-log hint, selection-aware suggest window
- **tui:** real visual-row input box height, Ctrl+J, and wheel-vs-history
- **tui:** multi-line input, growing input box, optional mouse scroll

### Changed

- **tui:** drop the task progress bar — keep just the "tasks: n/m" text
- **tui:** distinct color and a divider for operator messages

## [2.73.11] - 2026-10-12

### Fixed

- drop the duplicate render-how script; sync package-lock version

## [2.73.10] - 2026-10-12

### Fixed

- **tools:** reject invalid base64 instead of writing garbage

## [2.73.9] - 2026-10-12

### Fixed

- **qwen:** raise the default send pause to 4s (rate limit is real)
- **qwen:** read the real history shape (map) + handle quota_limit
- **cli:** honor --provider <id>; stop blocking bash -c in the sandbox

## [2.73.8] - 2026-10-12

### Fixed

- bound qwen net body, share attach flow, count transcript backpressure, buffer split paste
- lose fewer tool args, unstick the arg-error loop, harden launch

## [2.73.7] - 2026-10-12

### Changed

- docs(readme): fix the crooked back-edge arrowheads

## [2.73.6] - 2026-10-12

### Changed

- docs(readme): generalize the last DeepSeek-only mentions to both providers

## [2.73.5] - 2026-10-12

### Changed

- docs(readme): route the how-it-works back-edges below the boxes

## [2.73.4] - 2026-10-11

### Changed

- docs(readme): restore mermaid-style diagram with Qwen, finish provider-neutral prose

## [2.73.3] - 2026-10-11

### Fixed

- harden SSRF guard, sandbox, git args, mcp lifecycle and editor

## [2.73.2] - 2026-10-11

### Changed

- docs(readme): document Qwen everywhere and refresh the diagram

## [2.73.1] - 2026-10-11

### Fixed

- **qwen:** live provider switch, verified send, server-busy handling

## [2.73.0] - 2026-10-11

### Added

- **qwen:** a second chat provider (`chat.qwen.ai`), selectable with
  `/provider <deepseek|qwen>`, so the operator can switch models without
  leaving zames. Adds `src/qwen-ui.ts` (selectors), `src/qwen-net-capture.ts`
  (phase-aware SSE parser), `src/qwen-browser.ts` (`QwenBrowser`), a separate
  persistent profile (`~/.zames/qwen-profile`), `/model` to list/pick a Qwen
  model, and file attachments via the mode menu's "Upload attachment" item.
- **provider:** switching `/provider` mid-session now carries the conversation
  over: the current chat is summarized (on the old backend) and persisted as a
  handoff (`src/provider-handoff.ts`); the next launch posts it as the first
  message of the new provider's chat, so context is not lost. Falls back to a
  local history dump when the model summary is unusable. Unit-tested.
- **provider:** a `PROVIDERS` registry (`src/providers.ts`) is the SINGLE
  source of truth (ids, labels, `/chat` URL prefix), so adding a backend
  (ChatGPT, Gemini, …) is a data change plus the provider's own modules — not a
  dozen ternaries. `/provider` accepts any registered id; the config enum, the
  `{provider}` label and `/doctor` read from the registry. Unit-tested
  (`test/providers.test.ts`).
- **provider:** a `ChatProvider` interface (`src/types.ts`) both backends
  implement; the agent loop only depends on `BrowserLike` and never sees a
  concrete class. Operator notices (`ds.answer_timeout`, `ds.tool_retry`, …)
  now use a `{provider}` label so they never say "DeepSeek" while driving Qwen.

### Changed

- **ui:** the status line shows a provider badge ([Qwen]/[DeepSeek]) so the
  active backend is always visible in a multi-provider session.
- **qwen:** `listChats` / `fetchChatMessages` now use Qwen's OWN API
  (`GET /api/v2/chats/?page=1&exclude_project=true` and
  `GET /api/v2/chats/<id>?direction=up&limit=N`) with the DOM scrape as a
  fallback, so `/chats` and `/resume` work on a signed-in account (verified
  live: 9 chats with titles, 20 messages). Parsers are pure + tested.
- **qwen:** password login (`_autoLogin`) fixed to the verified order (email ->
  "Log in with a password" -> password -> submit); the email-CODE flow needs the
  operator to read the mail, so a saved password is preferred. Verified live.
- **qwen:** the context counter now uses `input_tokens` (the prompt size) —
  the true "used context" — instead of `total_tokens` (which adds the answer),
  so the status bar matches DeepSeek's semantics.
- **qwen:** thinking / web search are mapped onto Qwen's own UI: deepThinking
  ON selects the "Thinking" mode (OFF → "Fast") in the
  `.qwen-thinking-selector` dropdown, and webSearch toggles the "Web search"
  item in the "+" mode menu. `/thinking` and `/web` therefore work on Qwen too.
- **qwen:** no 15 s send throttle — a live experiment (4 back-to-back sends at
  0 ms gap) hit no rate limit, so `qwen.minSendIntervalMs` defaults to 1000 ms.
  The agent-loop watchdog deadline is derived from the Qwen answer timeout
  (a cold guest turn can take minutes), not the DeepSeek 240 s default.
- **provider:** sessions are tagged with the ACTIVE provider
  (`saveSession({…, provider})`), so `/resume`/`/last`/auto-restore only ever
  reopen a chat in the backend that created it (a chat id is meaningless to the
  other one). `loadLastSession(workdir, provider)` filters accordingly.
- **qwen:** the restored-dialogue scraper moved to a PURE `src/qwen-chats.ts`
  (mirroring `browser-chats.ts`) and now keeps only the OUTERMOST message
  container — the broad `[class*="message"]` chain matched an outer and an
  inner block, so every turn printed twice. `listChats` opens the sidebar first
  and matches `/c/<id>` links. Compact / auto-compact use the active provider's
  own answer timeout (`providerAnswerTimeoutMs()`), not DeepSeek's.

### Fixed

- **qwen:** recover from a lost page/context mid-run (relaunch + re-login, and
  re-navigate to the chat if the input is gone) instead of failing every retry.
- **qwen:** the guest daily limit (`getstsToken` → `RateLimited`) fails fast
  with a "sign in" message instead of a 20-minute rate-limit wait.
- **qwen:** the real sign-in flow is **email → one-time code from the letter**
  (not email+password): `_promptAndLogin()` now sends the email, asks the
  operator for the code in the terminal, submits it, and verifies the session
  from the page (guest header CTAs absent). `/provider login` re-runs it.
- **qwen:** a longer send-button wait when files are attached (the upload keeps
  the button disabled).

## [2.72.9] - 2026-10-10

### Fixed

- **release:** do not duplicate the Unreleased body into the version section
- **context:** raise the context budget and split agents/memory pools
- **browser:** handle the DeepSeek email MFA dialog on login
- **subagent:** fail safe when the parent chat id is unknown
- **tools:** honor a skill's allowed-tools frontmatter
- **context:** keep newest MEMORY.md notes and write facts to the project memory

## [2.72.8] - 2026-10-09

### Fixed

- **browser:** also treat generation_timeout as a truncated turn

### Fixed

- **browser:** also treat generation_timeout as a truncated turn

## [2.72.7] - 2026-10-09

### Fixed

- **ui:** show a queued-message banner for EVERY queued message

### Fixed

- **ui:** show a queued-message banner for EVERY queued message

## [2.72.6] - 2026-10-09

### Fixed

- **browser:** detect the property form of quasi_status (Stopped/FINISHED hang)

### Fixed

- **browser:** detect the property form of quasi_status (Stopped/FINISHED hang)

## [2.72.5] - 2026-10-09

### Changed

- **input:** extract the pure slash-command suggestion logic into input/suggest.ts (C3)

### Changed

- **input:** extract the pure slash-command suggestion logic into input/suggest.ts (C3)

## [2.72.4] - 2026-10-09

### Changed

- **index:** extract the pure /config rendering into config-commands.ts (C3)

### Changed

- **index:** extract the pure /config rendering into config-commands.ts (C3)

## [2.72.3] - 2026-10-09

### Changed

- **index:** extract the paste-aware terminal reader into src/prompt.ts

### Changed

- **index:** extract the paste-aware terminal reader into src/prompt.ts

## [2.72.2] - 2026-10-09

### Added

- **self-smoke:** add --reuse-profile and a bounded, explicit login failure (exit 2)

### Added

- **self-smoke:** add --reuse-profile and a bounded, explicit login failure (exit 2)

## [2.72.1] - 2026-10-09

### Changed

- **browser:** move cleanAnswer into browser-pure.ts (C3)
- **browser:** extract the element-level DOM callbacks into browser-dom.ts (C3)
- **browser:** extract the headless UA reader callback (C3)
- **browser:** extract the login-submit, UA-scan and busy-title callbacks (C3)
- **browser:** extract the in-page DOM callbacks into browser-dom.ts (C3)
- **answer-parse:** import the parser directly, drop the agent-loop re-export (C3b)

### Changed

- **browser:** move cleanAnswer into browser-pure.ts (C3)
- **browser:** extract the element-level DOM callbacks into browser-dom.ts (C3)
- **browser:** extract the headless UA reader callback (C3)
- **browser:** extract the login-submit, UA-scan and busy-title callbacks (C3)
- **browser:** extract the in-page DOM callbacks into browser-dom.ts (C3)
- **answer-parse:** import the parser directly, drop the agent-loop re-export (C3b)

## [2.72.0] - 2026-10-08

### Added

- close the open BACKLOG items (N31-N38, D2) and type the helper scripts

### Fixed

- **agent-loop:** honor the abort contract in the parallel read-only batch
- **changelog:** normalize the Unreleased group headings to ### and document changelog:sync
- **subagent:** harden the runner guards and keep the parent UI alive

### Changed

- rename agent-loop-pure.ts to answer-parse.ts
- **browser:** extract the chat DOM scrapers and the history parser (C3)
- extract the pure halves of browser/agent-loop and the CLI parser (C3)

### Added

- close the open BACKLOG items (N31-N38, D2) and type the helper scripts

### Fixed

- **subagent:** harden the runner guards and keep the parent UI alive

## [2.71.0] - 2026-10-08

### Added

- **subagent:** add the Task tool, enable subagents by default and instruct the model when to delegate

## [2.70.0] - 2026-10-08

### Added

- **browser:** centralize DeepSeek UI constants and add a UI health probe

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
