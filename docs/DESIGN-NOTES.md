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

  In the INK TUI the marker must exist ONLY in the rendered line:
  `TuiEditor.handleSubmit` expands it via
  `expandPastes(this.store.getSnapshot().pastes, ...)`, the same list
  `InputLine.onPastesChange` writes into the store. `InputLine.doSubmit` must
  call `onSubmit()` BEFORE it clears the list: clearing first made
  `expandPastes` a no-op and the agent received the literal `[Pasted lines#N]`
  instead of the pasted text (the operator's bug).

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


## The Continue button: auto-resume, throttle and the "Stopped" family

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

## Ink TUI (src/tui/): decisions worth keeping

The operator-facing UI is an Ink/React tree; `index.ts`/`run-task.ts` reach it
ONLY through the `UiEditor` interface (`src/tui/types.ts`), and the state bridge
is `TuiStore` (an external store read via `useSyncExternalStore`). Two layout
modes share the widgets: full-screen (`FullScreenApp`, `ui.alternateScreen`)
and inline (`TuiApp` + `<Static>`).

### The input box height MUST come from layoutInput, not from newline count

`inputBoxRows(prompt, buf, cursor, cols)` (src/input/layout.ts) = 2 border rows
+ `layoutInput(...).rows.length` VISUAL rows. Using
`buf.split('
').length` under-counted a WORD-WRAPPED long line, so the second
line printed over the first and the caret drifted. FullScreenApp reserves
`logHeight` from this number and InputLine renders from the SAME layout call, so
they cannot disagree. Any new row above the input must update `cursorTop` in the
same change.

A SECOND clipping source sat in the HEADER: the title row was assembled from
`left.length`/`dir.length` (code points, not columns) and the workdir was never
truncated, so a long path (or a narrow terminal) WRAPPED the row to a second
line. The panel height is `height={termRows}` (fixed), so the extra row pushed
the whole column down and clipped the TOP input row — the operator saw the
second input line overprint the first. The header now measures with `visLen`
and truncates the directory (`truncateToWidth`) so it is ALWAYS exactly
`HEADER_ROWS` (2).

A hint row BELOW the input box (the selection/scroll keys, `HINT_ROWS = 1`) is
part of the same fixed panel: it shrinks `logHeight` by one row but does NOT
touch `cursorTop`, which is measured from the top (header + log + status +
rows above the input). So adding it can never move the caret. The status row
itself is `height={1}` even when empty, otherwise it collapsed and shifted
every row below it (the inline caret landed on the bottom border).

### Multi-line keys: LF is NOT `key.return`

Ink maps CR (``) to `key.return` but LF (`
`, which is Ctrl+J) to
`name='enter'` — and `key.ctrl` stays FALSE, and the public `Key` type does not
expose `name`. A Ctrl+J binding that matched `input='j' && key.ctrl` therefore
never fired (the old test used exactly that impossible shape). `dispatchKey`
now treats a lone LF as a newline. `Shift+Enter` needs the kitty protocol (Ink
sends `CSI ? u` and the terminal answers); `Alt+Enter` is `ESC CR`; a trailing
`\` + Enter is handled via `KeyContext.endsWithBackslash`.

### The mouse wheel used to scroll the INPUT HISTORY

In the alternate screen most terminals convert the wheel into Up/Down arrow
keys (DECSET 1007, "alternate scroll mode"), and the editor maps those to
history at a buffer edge. `useMouseWheel` therefore DISABLES 1007 for the app
lifetime, so the wheel never becomes arrows.

The two useful behaviors are MUTUALLY EXCLUSIVE, so the hook has exactly two
modes and `mouseModeSequences(enabled)` returns a single sequence per mode:

- **SCROLL** (`ui.mouseScroll=true`, the DEFAULT): reporting is ON, the raw SGR
  events scroll the log, and drag-select needs Shift (the standard TUI
  convention: Claude Code / Codex / opencode do the same). `1007l` is sent so
  the terminal never turns the wheel into arrows, and the wheel must NEVER
  touch the input history (history is arrow keys only). This is the default
  because the operator asked that the wheel scroll the DIALOG.
- **SELECT** (`ui.mouseScroll=false`): mouse reporting stays OFF, so the
  terminal owns the mouse — drag-select works natively and the wheel is inert.
  The 1007l primer is applied once at mount (with reporting briefly on, since
  some terminals ignore 1007l otherwise) and reporting is then turned back
  off; the listener is not bound, so nothing consumes the selection.

Earlier the hook enabled reporting UNCONDITIONALLY and only gated the scroll,
so native selection was lost even with the option off. A SECOND regression was
the effect depending on `onWheel` (an inline arrow): it re-ran on every render
and each cleanup wrote `1007h` (alternate-scroll ON => wheel becomes an arrow
=> input HISTORY). The effect now depends only on the mode + stdin and reads
the callback from a ref, so the mode bytes are written exactly once. A sequence
split across two stdin chunks is still carried via `incompleteTail()`.

### The log viewport windows by RENDERED ROW

`src/tui/log-window.ts` (`entryRows`/`windowByRows`/`totalRows`) estimates each
entry's height at the terminal width (ANSI stripped, wide chars = 2) so a long
wrapped answer cannot overflow the panel and a single oversized entry is kept
(its tail shown) rather than dropped. `store.scroll` is measured in ROWS.

### Browser-based login is the PRIMARY path (the TUI form is the fallback)

Updated with GLM: the operator's requirement is now "auto-login → a VISIBLE
browser window when that fails → back to headless". The reason is concrete:
z.ai (like DeepSeek at times) answers a headless submit with an Aliyun SLIDER
CAPTCHA, which neither a terminal prompt nor a filled form can pass — a human
has to drag the slider in a real window.

The sequence lives in `src/browser-login.ts` (`interactiveBrowserLogin`),
shared by all three providers:

1. `probeLogin() === 'in'` → done, no window flashes;
2. the EXISTING `_autoLogin()` with the saved credentials (they are permanent
   in the config, so a logged-out profile signs in silently);
3. a guest is allowed and no login was requested → work as a guest;
4. non-interactive (`--task`, no TTY, a scheduler job,
   `ZAMES_NONINTERACTIVE_LOGIN=1`) → `LoginRequiredError` FAST, no window;
5. no display (`canShowWindow` is only a preliminary filter — WSL2 often
   exports DISPLAY with a broken WSLg) → the in-TUI form below;
6. headless → `relaunchSafe(headed)`, open the login page, prefill the saved
   login, hook the form (`page.exposeFunction`) so the credentials the human
   types are saved for the NEXT silent auto-login;
7. poll `probeLogin()`; a CLOSED window counts as "done"; Esc cancels;
8. not `stayHeaded` → `relaunchSafe(headless)`; if the session did not carry
   over, go back to headed ONCE and stay there (never a loop).

`stayHeaded` is true for `--headed`, `headless:false`, `--dev` and
`hotReload`: an operator watching the window, or a developer, keeps it.

**Session preservation across the relaunch.** `relaunchSafe()` reads
`context.cookies()` BEFORE closing and re-applies the SESSION cookies
(`expires === -1`) with `addCookies()` BEFORE the first `goto` — otherwise the
SPA gets a 401 and may wipe its own token. A persistent cookie survives in the
profile on its own. This was measured on a COPY of a profile: the GLM session
is the `token` key in localStorage (plus a `token` cookie) and it does NOT
survive closing the context without that step.

**Browser fingerprint (measured).** Headed and headless run the SAME engine
(`channel`), the sanitized UA is taken from the headed launch and cached per
ENGINE (not per provider), and `navigator.webdriver` is false in both. A
headless Chromium reports `plugins: 0` where a headed one reports 5 — a
known, harmless difference that z.ai did not gate on (the captcha appeared in
both). A `HeadlessChrome` UA is still stripped (DeepSeek's CDN 403s it).

### Login stays inside the TUI (the fallback)

`browser.ts` / `qwen-browser.ts` call an optional `onLoginPrompt` (and DeepSeek
`onMfaPrompt`) instead of readline, which would pause Ink and fight it for
stdin. `LoginForm.tsx` (username + masked password) and `TextPrompt.tsx` (one
line, optional mask) render in the Ink app; `login-pure.ts` holds the tested
masking + validation. `index.ts` wires the callbacks to the LIVE browser after
the editor exists and re-wires them on `/provider` BEFORE `waitForLogin()`.

### Copying

A terminal has no pointer, so Ctrl+Y / `/copy-code` USED to copy a fenced code
block from the last answer (`extractCodeBlocks()`, src/code-blocks.ts). The
operator said the whole code-copy feature is not needed, so the hotkey, the
`/copy-code` command and the `⌘ n/m` status badge are gone. `/copy` (the whole
last answer to the clipboard) stays; so does `src/code-blocks.ts`, kept as a
pure helper.

### Skills get a DISCIPLINE paragraph (the superpowers idea, without the hook)

superpowers (github.com/obra/superpowers) makes a coding agent actually USE
its skills by injecting a `using-superpowers` bootstrap at SessionStart and
after every compaction: "before a task, check whether a skill applies". zames
already DISCOVERS skills (`loadProjectContext`) and lists their frontmatter in
the `## Skills` section, but a static list is dead weight — the model has no
instruction to act on it. `SKILLS_DISCIPLINE` (src/system-prompt.ts) is that
instruction as plain prompt text, appended to the section whenever at least one
skill exists: scan the list before a NON-TRIVIAL task, Read the matching
`file:`, follow the body; a trivial edit is explicitly exempt so the model does
not burn iterations Reading SKILL.md files for a one-line change.

The one real conflict with superpowers is its CONVERSATIONAL turn
(brainstorming asks the operator questions and waits). zames has no such turn:
the operator sees only the final `respond`. The bundled `brainstorming` skill is
therefore REWRITTEN to do the reasoning silently and return one concrete
proposal (goal / assumptions / what will NOT be done / the one decision it
cannot make alone), instead of an interview.

The five methodology skills are BAKED INTO `BUILTIN_SKILLS` (src/context.ts),
not shipped as `.zames/skills/*/SKILL.md`. Reason: `.zames/` is gitignored and
never in the npm `files` list, so a disk copy would reach only THIS checkout —
a user who ran `npm i -g zames_pro` would see no methodology skills at all. As
built-ins (like `commit`/`review`/`test`) they travel inside `dist/` and are
available out of the box; a project SKILL.md of the same name still overrides
the built-in copy. The disk copies in `.zames/skills/` are a local convenience
for editing them during development.

Deliberately NOT ported: parallel subagents (`dispatching-parallel-agents`),
git worktrees, the full subagent-driven-development loop, and the plugin/
telemetry infrastructure — all conflict with zames' single-browser,
single-send-slot, single-workdir design.

## GLM / chat.z.ai

Recon was a LIVE signed-in session in an isolated profile (Chromium, October
2026); the anonymized captures are in `test/fixtures/glm/`. Everything the
provider implements is backed by one of them — a mechanism that did not appear
in the dump is NOT implemented (see "not observed" below).

### DOM (verified)

- input: `textarea#chat-input` (a plain textarea, not contenteditable)
- send: `button#send-message-button` (`type=submit`, `class sendMessageButton`)
- new chat: `button#sidebar-new-chat-button` ("New Task");
  `#new-chat-button` on mobile
- model: `button#model-selector-<id>-button`, label = display name
  (`GLM-5.3-Flash`), id = internal id (`x-preview-l`)
- a chat URL: `https://chat.z.ai/c/<uuid>`
- user turn: `div.chat-user`; assistant turn: `div.chat-assistant`
  (`markdown-prose`); the wrapper carries `id="message-<uuid>"`
- reasoning: `.thinking-chain-container` ("Thought Process") — NEVER the answer

### Endpoints

- `POST /api/v1/chats/new` — creates the chat, returns `{ id }`
- `POST /api/v2/chat/completions?...` — SSE, the answer
- `GET /api/v1/chats/?page=N` — a BARE ARRAY (not `{data}`)
- `GET /api/v1/chats/<id>` — `{chat:{history:{messages:{<id>:{...}}}}}`
- `GET /api/models` — OpenAI-style catalogue (`info.params.max_tokens`)
- `GET /api/v1/auths/` — the user/guest record (`role: 'guest' | 'user'`)

### Auth

The bearer token is in localStorage (`token`) and a `token` cookie; the
completions URL carries the same JWT as a query parameter. A GET from inside
the page is repeatable for the list/history/models (no extra signature was
needed), so `listChats`/`fetchChatMessages`/`listModels` use `fetch` from the
page. A completions request ALSO carries `captcha_verify_param`, so it is
driven through the UI, not replayed.

### SSE (only what was observed)

```
data: {"type":"chat:completion","data":{"delta_content":"...","phase":"thinking"}}
data: {"type":"chat:completion","data":{"phase":"other","usage":{prompt_tokens,...}}}
data: {"type":"chat:completion","data":{"delta_content":"PONG","phase":"answer"}}
data: {"type":"chat:completion","data":{"phase":"done","done":true}}
```

Tool traffic from z.ai's OWN runtime (`phase: tool_call` / `tool_response`,
`delta_name`/`delta_arguments`) was observed too. It is NOT the zames protocol,
so the parser skips it and the provider keeps that runtime OFF
(`preview_mode:false`; the `general_agent` flag is z.ai's agent mode).

### z.ai runs ITS OWN agent runtime — zames must switch it off

This is the most important difference from DeepSeek/Qwen. The completion body
z.ai builds ALWAYS carries:

```json
"features": {"preview_mode": true, "flags": ["general_agent"], "enable_thinking": true}
```

With those flags the site intercepts the model's tool calls, runs them in ITS
sandbox (`/home/z/my-project`) and streams back a `tool_response`. Observed
symptoms before the fix:

- the model said "I created /home/z/my-project/probe.txt" while OUR workdir had
  nothing (measured: `FILE IN OUR WORKDIR: false`);
- it also answered "this environment has no /workspaces/zames/zames_pro";
- the smoke's old `toolCall` scenario passed FALSELY — the model "printed" a
  call the site had already executed.

There is NO UI control for these flags (the recon found none, and forcing
`last_mode=chat` in localStorage does not change the body). The one lever is
the request itself: `GlmBrowser._installRuntimeRewrite()` installs a
`page.route()` on `/api/v2/chat/completions`, sets `preview_mode = false`
and drops `general_agent` from `flags` BEFORE the request leaves the page.
Controlled by `disableAgentRuntime` (default true).

After the rewrite (measured):
- the model answers honestly: "no command was executed … I'd be fabricating
  results if I claimed to have run it";
- a real `runAgentLoop` creates the file in OUR workdir
  (`FILE: true HELLO_GLM`);
- the smoke's `toolCall` passes for the RIGHT reason (the call reaches us).

If z.ai changes the endpoint or the flag names, the rewrite silently stops
matching — the symptom is again "the model claims to have run something".
`/debug-dom` and the `sends-glm.jsonl` telemetry (which records the outcome)
are the first places to look.

### Captcha

A FIRST message from a fresh profile is gated by an Aliyun slider
("Please drag the slider to complete the puzzle", `CertifyId`). A headless
browser cannot pass it.

MEASURED, and it matters for the smoke: even a SIGNED-IN session gets the
slider in HEADLESS mode, while the SAME profile in a HEADED window sends fine.
So the captcha is not (only) a login gate — it is a headless-vs-headed
difference for the send itself. Consequence: `npm run glm-smoke` passes the
ask/toolCall scenarios with `--headed` and fails them headless (listModels,
history, attachment still work headless, because they are not sends).

The provider reports this as a clear error (`glm.captcha`) instead of waiting
out the answer timeout. A HEADFUL run is therefore the practical way to use
GLM today; a headless session would need a way to pass the slider, which this
build does not expose.

### Mode flags are server-side defaults (measured)

The completion body always carries `preview_mode: true`,
`flags: ['general_agent']` and `enable_thinking: true`. No UI control changes
them (the recon found none, and forcing `last_mode=chat` in localStorage did
not change the body). The provider therefore VERIFIES the body
(`src/glm-flags.ts`) and warns the operator, instead of pretending to toggle
it. In practice the smoke still parsed the tool call fine with those flags on,
so the warning says "may break", not "breaks".

### Not observed (deliberately NOT implemented)

- edit-patches / an `<details type="reasoning">` block
- a guest-limit message with a specific wording (the captcha fires first)
- a Continue button for a truncated turn
- thinking / web-search UI toggles (the flags travel in the request body; no
  stable control was seen) — part C verifies the body instead
- "AI Slides" / "Full-Stack" / image generation as part of the answer protocol
  (they change the format and would break the tool-call protocol)
