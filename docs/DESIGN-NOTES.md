# Design notes — why the hard parts are the way they are

Moved out of AGENTS.md (see BACKLOG C2): the deep root-cause write-ups and
browser/terminal mechanics. AGENTS.md keeps the ACTING rules plus a short
summary with a pointer here. Read this file when you touch the matching
module; it is NOT injected into every task.

---

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

### DeepSeek <ds_safety> blocks are not answers

DeepSeek sometimes returns its OWN safety-classification block
(`<ds_safety>[用户未成年]否…</ds_safety>Safe`) INSTEAD of an answer. It is neither a
tool-call nor a real final answer. It is now treated as a SERVICE answer in
`runAgentLoop()` (the `looksService` check matches `<ds_safety>`), so the loop
re-asks the model instead of stopping on it. (The restore filter in
`normalizeRestoredMessage()` also drops it from the printed history.)

### Structural guard against "slipped into chat mode"

Old guards keyed on WORDS (responseLooksLikeToolCall — looks like a call,
looksLikeUnfinishedWork — future-tense promise). DeepSeek also writes a
reasoning PARAGRAPH with no call at all ("Итак, разберём...", "The problem
is..."); it matched neither guard and was returned as the final answer — the
"agent stopped mid-task" symptom. The fix is STRUCTURAL: runAgentLoop counts
toolsRanInTask; once > 0, a plain-text answer that is neither a parsed tool
call nor a real respond is NOT a clean final. It warns the operator, logs
protocol_violation_final and appends a "may be incomplete" note. We do NOT
enumerate reasoning phrases (the model would just reword); the structure is the
signal. Guard is off when no tool ran. Covered by test/protocol-guard.test.ts.

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

### beforeText must come from the DOM, never from the network capture

A second root cause of the SAME "agent stopped after a tool call" flapping:
`beforeText` was read through `_readLastAnswerTextClean()`, which prefers
`_netCapture` when it is fresh. After a send, `_onResponse` rewrites
`_netCapture` with the CURRENT answer, so the DOM-vs-capture comparison in
`_askOnce()` compared the capture against ITSELF: `cur === beforeText`, the
`changed` signal never fired, and `ask()` ended with `ds.send_no_new_answer`
and retried for minutes. The operator saw repeated
`ask() попытка N/3 провалилась: Новый ответ не получен`.

Fix: `beforeText` (and the `cur`/`cur2`/final comparisons in `_askOnce`) now
use `_readLastAnswerTextCleanDom()` / `_readLastAnswerTextDom()`, which read
the RENDERED page and never touch `_netCapture`. The capture is kept purely
as a freshness signal (`_netCaptureAt >= _lastSentAt`) and as the raw answer
for the tool-call. `_readLastAnswerText()` (capture-first) is still used to
RETURN the answer, so the raw-text contract is unchanged. Covered by
`test/answer-source.test.ts`.

### The DOM answer reader must fall back to the network capture

A resumed chat can hang `ask()` even though DeepSeek answered: the answer is
already in `_netCapture` (the SSE body), but `_readLastAnswerTextCleanDom()`
returns an empty string (the history is re-rendering, the answer selector
lags, or `page.evaluate` times out). The finish-loop required `!!cur`, so
`isNew` stayed false, the network answer was ignored, and `ask()` spun until
the deadline — the "agent hangs after the first message in a resumed chat"
symptom. Fix: in the finish-loop, when the DOM is empty but the capture is
fresh (`_netCaptureAt >= _lastSentAt`), fall back to `_cleanAnswer(this._netCapture)`.
Also: when the status text is too long to leave room, the token context goes
on its OWN line instead of being crammed onto one row (cramming pushed the
trailing `%` past the right edge and truncated it to `1.8`).

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

### The pause before a send is animated too (onSendPause)

The `minSendIntervalMs` throttle (15s by default) is waited out INSIDE
`_askOnce()`, BEFORE `onSendStart` fires. During that wait `_waitForSendSlot()`
used to print a static `⏳ пауза Nс перед отправкой` line — there was no
spinner animation, and the operator saw a frozen status ("the spinner does not
move").

Fix: `DeepSeekBrowser` exposes a second hook, `onSendPause(seconds)`, fired in
`_waitForSendSlot()` when the pause starts AND refreshed about once per second
with the remaining seconds (via the optional `onTick` of `_sleepInterruptible`),
so the status visibly counts down. The static `console.error` line is now only
a fallback when no hook is wired.
`runAgentLoop()` wires `browser.onSendPause = safe(onSendPause)` alongside
`onSendStart`, and `runTask()` (src/index.ts) passes `onSendPause: (s) =>
ui.sendPause(s)` and clears `browser.onSendPause = null` in its `finally`.
Both UIs implement `sendPause()`: `LineEditor` (src/input.ts) and the ora
`SpinnerUI` (src/spinner.ts) start the SAME animated dot sequence as the
thinking spinner, but with the pause text. In `LineEditor` the animation logic
was factored into `_startAnimated(baseText)` (shared by `_startThinking()` and
`sendPause()`); in src/spinner.ts the same for `startAnimated(baseText)`.
Because the browser calls `onSendPause` about once per second (to refresh the
countdown), both implementations only UPDATE the base text and keep the running
dot timer while the animation is already active (`_animating`/`animating`
flag) — otherwise the dots would restart from zero every second and look frozen
on a single dot.
The editor's own labels (`spinner.hint`, `spinner.pause`, `editor.more`,
`editor.answer`) go through i18n: `LineEditor` takes a `locale` option
(passed from src/index.ts, and refreshed via `editor.setLocale()` when
`/config lang` changes it). The ora `SpinnerUI` already received `locale`.
There must be NO hardcoded Russian in src/input.ts or src/spinner.ts — the
interface strings live in the i18n `CATALOG`.

### Service notices must go through the UI (onNotice)

`ask()` prints user-facing notices (rate limit, server busy, resend, restart)
via `this._notice(text)`, NOT `console.error`. While a `LineEditor` is active it
repaints its own status line, so a raw stderr write is OVERWRITTEN — the
operator saw only the spinner ("агент завис на спиннере") and not the reason
after "Messages too frequent". `_notice()` routes the text through the
`browser.onNotice` hook, which `runAgentLoop()` wires to the UI (`ui.warning()`
→ printed ABOVE the input line); without a hook it falls back to stderr. The
same applies to the attachment warnings. `browser.onNotice` is cleared in
`runTask()`'s `finally`, alongside `onSendStart`/`onSendPause`.

`browser.minSendIntervalMs` (default **15000**) — the minimum pause between
agent sends (tool-result / resend). `browser.thinkingExtraMs` (default
**2000**) is ADDED to it when Deep thinking is ON: reasoning turns add extra
requests (`chat/continue` clicks, truncation retries), so a small extra margin
reduces the chance of "Messages too frequent". The effective interval is
`sendIntervalMs() = minSendIntervalMs + (deepThinking ? thinkingExtraMs : 0)`,
used by BOTH `_waitForSendSlot()` and the Continue-click throttle. It is the
LOWER bound between two sends — long reasoning only makes the real gap larger.

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
- typing repaints ONLY the input rows (`_renderInputOnly()`), never the
  status/spinner block above it. Every buffer/cursor change in `_handle()` used
  to call the full `_render()` (erase the whole block + rewrite status + input).
  While the spinner animates (a redraw every ~100ms) that made the WHOLE screen
  blink on every keystroke — the "при вводе текста мигает весь терминал"
  symptom. The status line has its own animation timer and is repainted by
  `printAbove()` / `refreshStatus()`; keystrokes must not touch it.
  `_statusTop` (set by `_writeBlock()`) keeps `cursorRowFromTop` correct
  without repainting the status. `_render()` is still used for status changes
  (locale, commands, lock hint, context counter).
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

### Resize: erase ONLY the block, never the whole viewport

A terminal resize (SIGWINCH) re-flows the lines above the editor block, so the
block's ABSOLUTE row changed. The block itself must be redrawn at the new width.

What NOT to do: clear the whole viewport (`ESC[2J`). That pushes the history
above (tool calls, answers) into the scrollback and leaves a blank gap between
the footer and the text the operator was reading — they had to scroll up to see
their own chat.

What works: `_eraseBlock()` moves the cursor up by the cursor's row WITHIN the
block — a RELATIVE move that lands on the block's top row regardless of the
reflow — and clears from there (`ESC[J`). Only our own rows (status + input) are
wiped; the history above stays visible and in place. `_blockRows` is reset on
the re-pin so the shrink-padding (`_padShrink`) does not scroll a gap open. The
resize handler is debounced (120 ms); the redraw itself is deferred to the NEXT
`_writeBlock()` via `_resizeRepin`, because the erase must happen on a real
render, not inside the SIGWINCH callback.

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

---

## The "Stopped" hang: `quasi_status` arrives in TWO shapes

Symptom (seen live): the operator saw DeepSeek RENDER a chat message
"Server is temporarily unavailable." with a retry button, while the agent's
status stayed on "▶ генерация" and did nothing until the timeout. It was not
clear whether the agent was waiting or generating.

Root cause: DeepSeek sends the generation status in TWO different JSON shapes:

1. the INITIAL message, as a property inside `v.response`:
   `{"v":{"response":{...,"quasi_status":"FINISHED"}}}`
2. later BATCH updates, as a key/value pair:
   `{"p":"quasi_status","v":"FINISHED"}` (also `"response/status"` `SET`).

`FINISHED_STATUS_RE` and `INCOMPLETE_STATUS_RE` (deepseek-ui.ts) matched ONLY
the BATCH form: `"quasi_status","v":"FINISHED"`. So a turn that ended in the
PROPERTY form (which is exactly how the "Server is temporarily unavailable"
body came — `status: FINISHED`, empty `fragments`, no RESPONSE) was NOT
detected. `extractAnswer()` returned '' (no RESPONSE fragment), so `_netCapture`
was empty and the finish loop spun to `answerTimeoutMs`; the operator saw the
stuck "generating" status and an unreacted error message in the chat.

Fix: both regexes now match EITHER shape —
`/"quasi_status"(?::|,"v":)"FINISHED"/i` (and the INCOMPLETE twin). Verified
against the EXACT captured body that hung the live agent:
`extractAnswer()` is still '' but `isFinishedWithoutAnswer()` is now true, so
the finish loop clicks Continue / resends instead of waiting. Scale check
across ~12k real captures: the property form appears in 21 FINISHED and 1
INCOMPLETE body the old regexes missed. Covered by
test/generation-incomplete.test.ts (adds the property-form regression case).

LESSON: a status may be emitted both as an initial JSON property AND as an
incremental BATCH path. A detector keyed on ONE textual shape silently misses
the other; when adding a protocol detector, match every shape the live captures
show.

### Related: `generation_timeout` (Server busy) was undetected too

While auditing the protocol detectors against the real captures, a SECOND body
in the same family turned up: `finish_reason: "generation_timeout"` with
`"Server busy, please try again later."` and NO RESPONSE fragment. It was
matched by NEITHER `generation_err` NOR `quasi_status`, so `isGenerationIncompleteText()`
returned false and the finish loop would wait out the whole timeout — the same
hang. `GENERATION_TIMEOUT_RE` (deepseek-ui.ts) now treats it like
`generation_err` (retry, do not hang). Verified against the 3 real captures
that carry it: all 3 are now detected. Covered by test/deepseek-ui.test.ts.

The AUDIT method is the takeaway: for EVERY protocol detector, count how many
real bodies contain the marker vs how many the detector actually matches. A
non-zero gap is a silent hang. This caught both fixes.
