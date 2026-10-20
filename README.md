<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/logo.jpg" alt="zames logo" width="430">
</p>

<h1 align="center">zames_pro</h1>

<p align="center">
  <strong>A terminal coding agent that drives real web chat LLMs (DeepSeek, Qwen, …) through a browser — no API key required.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zames_pro"><img src="https://img.shields.io/npm/v/zames_pro.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/zames_pro"><img src="https://img.shields.io/npm/dm/zames_pro.svg" alt="npm downloads"></a>
  <a href="https://github.com/Viqto0r/zames_pro/actions/workflows/test.yml"><img src="https://github.com/Viqto0r/zames_pro/actions/workflows/test.yml/badge.svg" alt="tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" alt="TypeScript"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

<p align="center">
  <strong>English</strong> | <a href="#readme-ru">Русский</a>
</p>

A terminal coding agent that works on top of real web chat LLMs
([chat.deepseek.com](https://chat.deepseek.com/), [chat.qwen.ai](https://chat.qwen.ai/), …)
through Playwright.
In spirit it is similar to Claude Code / Codex CLI: it starts in the current
directory, reads and edits files, runs commands, and commits to git.

> No API key required — it drives a DeepSeek or Qwen web chat like a regular
> user through a real (headless) browser.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/demo.png" alt="zames session in the terminal" width="860">
</p>

## Quick start

```bash
npm install -g zames_pro   # Chromium for Playwright is downloaded automatically
cd your-project            # any folder the agent should work in
zames                      # sign in once, then describe your task
```

There is **no API key and no per-token bill**: zames signs in to **your own
[chat.deepseek.com](https://chat.deepseek.com/) or
[chat.qwen.ai](https://chat.qwen.ai/) account** in a real (headless) Chromium
and drives the web chat like a regular user. The first launch asks for your
login once (the session is stored in `~/.zames/profile` for DeepSeek or
`~/.zames/qwen-profile` for Qwen); after that just run `zames` and type a task
in plain language:

```text
❯ refactor the config loader and add a test for the new default
```

While the agent works you can keep typing — a message sent mid-task is queued
and runs right after it, in the same chat. `Esc` aborts the current generation,
`/help` lists commands, `/exit` quits.

## How it works

zames does not call the model API. It launches a headless Chromium with a
persistent profile, signs in to a chat web app like a human, types the task
into the chat box, and reads the answer back.

Two chat backends are available, switched with `/provider <deepseek|qwen>`:
**DeepSeek** (`chat.deepseek.com`, the default) and **Qwen** (`chat.qwen.ai`).
The switch is **live** — zames closes the current backend and opens the other
one in place, no restart needed. Each keeps its own persistent profile
(`~/.zames/profile` and `~/.zames/qwen-profile`), so switching never signs the
other one out.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png" alt="how zames works" width="860">
</p>

In text: you type a task → zames sends the system prompt plus the task into
the active chat web app (DeepSeek or Qwen) → the model answers → zames parses
the tool call, runs the tool locally, feeds the result back, and prints the
final answer for you.

Key pieces:

- **The answer is read from the raw network stream** (SSE), not the rendered
  DOM, so tool-call JSON with template strings and escapes survives intact.
- **A persistent per-provider profile** (`~/.zames/profile` for DeepSeek,
  `~/.zames/qwen-profile` for Qwen) keeps you signed in; the headless
  User-Agent is patched so the site's CDN does not 403 the login.
- **A send throttle** (15 s on DeepSeek, ~1 s on Qwen, which tolerates rapid
  sends) keeps the web chat's rate limit happy during long tool-heavy runs.
- **The agent is sandboxed** to the directory it was started in — no tool can
  read or write above it.

## Table of contents

- [Quick start](#quick-start) · [Features](#features) · [Why zames?](#why-zames) · [Requirements](#requirements)
- [How it works](#how-it-works) · [Installation](#installation) · [Signing in](#signing-in) · [Usage](#usage)
- [Switching providers (DeepSeek / Qwen)](#switching-providers-deepseek--qwen)
- [Tools](#tools) · [Slash commands](#slash-commands)
- [Project context, skills and memory](#project-context-skills-and-memory) · [MCP (external tools)](#mcp-external-tools) · [Configuration](#configuration)
- [FAQ](#faq) · [Links](#links) · [License](#license)

## Features

- **Tools like Claude Code / Codex** — `Read`, `Write`, `Edit`, `Bash`,
  `Glob`, `Grep`, plus `MultiEdit`, `ApplyPatch`, `LS`, `TodoWrite`, git and web
  tools. Every edit is backed by `/undo`.
- **Runs while you keep typing** — queue messages during a task; they run right
  after it, in the same chat (like typing during generation on the web).
- **Plan mode** — `/plan` (or `--plan`) drops all mutating tools, so the agent
  can investigate the code without touching the tree.
- **Project context** — reads `AGENTS.md`, `MEMORY.md`, skills (`SKILL.md`) and
  custom commands from the repo and `~/.zames`, the same idea as Codex / Claude
  Code.
- **Subagents** — the `Task` tool delegates a self-contained sub-task to an
  agent in its own separate chat (isolated context), which returns only a
  report, so heavy research does not flood the main context. On by default;
  tune with `browser.subagents` / `browser.maxSubagents`.
- **MCP support** — plug in external tool servers (e.g. `@playwright/mcp`).
- **Scheduling** — `/loop`, `/cron` and `/jobs` repeat tasks on a timer.
- **Bilingual UI** — Russian / English (`/config lang`).

## Why zames?

- **Built with itself** — `zames_pro` is developed by `zames_pro`. No other
  coding agent is used on this repository: the agent in this very terminal
  reads the sources, runs the tests, fixes the bugs and commits the result.
  That is the daily proof that it works and is actually used.
- **No API key, no per-token bill** — it uses your own DeepSeek or Qwen chat
  account, not the paid API. Good for long, tool-heavy tasks.
- **Same workflow as Claude Code / Codex** — tools, `AGENTS.md`, skills, MCP
  and slash commands, so it feels familiar from day one.
- **Runs unattended** — headless by default, resumable sessions, and `/loop`
  plus `/cron` for scheduled work.
- **Local-first** — the browser profile, credentials and logs never leave your
  machine, and the agent is sandboxed to the project directory.

## Requirements

- Node.js >= 20
- An account on the chat you want to use — **DeepSeek** (`chat.deepseek.com`,
  the default) or **Qwen** (`chat.qwen.ai`). Qwen also works in guest mode for
  a few messages. On first launch zames asks for your login in the terminal
  (and stores it in `~/.zames/config.json` after a successful sign-in, so a
  later logout is handled automatically without asking you again). You can also
  sign in manually in the browser window when the browser is headed.

## Signing in

The browser runs **headless by default**. When the active backend requires a
sign-in, zames:

1. reuses the session stored in the persistent profile (`~/.zames/profile` for
   DeepSeek, `~/.zames/qwen-profile` for Qwen) if it is still valid;
2. otherwise signs in automatically with the saved credentials
   (`browser.auth.username` / `browser.auth.password`);
3. otherwise asks you for the login/password in the terminal (in a TTY) and,
   after a successful sign-in, remembers them for next time;
4. otherwise falls back to a manual sign-in hint.

To sign in by hand (for example, if the site shows a captcha), run with a
visible window:

```bash
zames --headed
```

The `--headless` flag (the default) and `headless: true` in the config keep
the browser without a window; `--headed` / `headless: false` show it.

Headless works out of the box: a headless Chrome normally advertises a
`HeadlessChrome/...` User-Agent that the site's CDN blocks with a 403, so
zames strips that marker before loading the page (keeping the real engine
version). You do not need `--headed` just to log in.

Credentials and toggles can also be edited from `/config`
(`browser.auth.username`, `browser.auth.password`, `browser.auth.saveSession`).

## Switching providers (DeepSeek / Qwen)

zames can drive either **DeepSeek** (`chat.deepseek.com`, the default) or
**Qwen** (`chat.qwen.ai`):

```bash
/provider qwen      # switch to Qwen (persisted) — applied live, no restart
/provider deepseek  # switch back
/provider status    # show the active provider / model / login state
/provider login     # (re)run the sign-in check
/model              # list Qwen models
/model qwen3.7-plus # pick one
```

Notes:

- The switch is **live**: zames closes the current backend and opens the other
  one in place, so no restart is needed. The two backends use **separate
  persistent profiles** (`~/.zames/profile` for DeepSeek, `~/.zames/qwen-profile`
  for Qwen), so switching never signs the other one out.
- A chat id belongs to ONE backend, so the new provider opens a **fresh chat**.
  If the previous chat had messages they are summarized and posted as a
  handoff with the next task; an empty chat is switched silently.
- Qwen works in **guest mode** without an account, but a guest is limited to a
  handful of messages per day; for long agent runs sign in (email / Google /
  GitHub — no phone required). zames auto-logins from the saved credentials or
  asks in the terminal, exactly like DeepSeek. `/model` changes the Qwen model
  at runtime.
- File attachments on Qwen go through the mode menu's **Upload attachment**
  item; DeepSeek uses its own paperclip.
- `/doctor` shows the active provider and the UI health of that provider's
  page.

## Installation

```bash
npm install -g zames_pro
```

Chromium for Playwright is downloaded automatically on install. On Linux/WSL
the required system libraries are installed too when passwordless `sudo` is
available; otherwise run once by hand:

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium
```

## Usage

Go to your project folder and run:

```bash
zames
```

The agent works inside the directory it was started in and cannot leave it (sandbox).

While the agent is working you can keep typing: press Enter to queue a message
(it is sent right after the current task, in the same chat), or Esc / Ctrl+C to
abort the current generation. This mirrors typing during generation on the
web chat.

### Input line

The prompt is a small line editor with persistent history:

- `↑` / `↓` — walk the message history (saved in `~/.zames/history.json`, so it
  survives a restart); inside a multiline message the arrows move between lines.
- `Ctrl+R` — incremental reverse search over the history (bash-style): type to
  filter, `Ctrl+R` for older matches, `Enter` to accept, `Esc` to cancel.
- `Ctrl+_` — undo the last edit in the input line (a fat-fingered `Ctrl+U` /
  `Ctrl+K` is recoverable).
- `Ctrl+U` — clear the line, `Ctrl+K` — delete to end of line, `Ctrl+W` —
  delete the word before the cursor, `Ctrl+←`/`Ctrl+→` — move by words.
- `\` + `Enter`, `Ctrl+J`, `Ctrl+Enter` or `Shift+Enter` — insert a newline.
- `/` + `Tab` — slash-command hints and completion.
- `!command` — run a shell command directly, bypassing the model (like
  Claude Code's bash mode). The same sandbox guard as the `Bash` tool applies,
  so a direct command cannot leave the project either.

Full-screen mode adds dialog navigation, so a long answer can be read and
selected without leaving the terminal:

- `ui.mouseScroll=false` (default) — the terminal owns the mouse: normal text
  selection works and the wheel is inert (it never scrolls the input history —
  history is arrow keys only).
- `ui.mouseScroll=true` — the app consumes the wheel and scrolls the dialog;
  selecting text then needs `Shift`+click (the TUI convention).
- `PgUp` / `PgDn` — move up/down the dialog half a screen.
- `Home` / `End` — jump to the very top / bottom of the dialog (only while the
  input line is empty; with text typed they move the caret as usual).
- To copy a LARGE block, use `/export` (writes the whole session as Markdown)
  or the transcript file (`/transcript` shows the path) — the terminal's own
  drag-select cannot reach past one screen.

Set `NO_COLOR=1` to disable colors (a calm default palette is used otherwise).

### Images and files

You can paste an image or a file into the input line (Ctrl+Shift+V / Shift+Insert
or the terminal's own paste). zames saves it under `<project>/tmp` and shows a
marker in the line - `[image#1]` for images, `[file#1]` for other files - then
uploads the real file to the chat together with your message. These are the
same formats the DeepSeek / Qwen web chat accepts (PNG, JPEG, GIF, WEBP, BMP,
SVG and the usual document types).

Pasting an image works when the terminal sends it as a `data:` URL or as a
base64 blob with a recognizable image signature. You can also paste a path to a
local file (drag a file into the terminal or copy its path); if the file exists
it is attached, otherwise the text is inserted as usual.

Press Ctrl+V (or use an empty paste) and zames reads the image straight from
the clipboard: Linux via wl-paste (Wayland) or xclip/xsel (X11), macOS
via pngpaste, Windows via PowerShell. The needed Linux tools are installed
automatically on npm install (best-effort, through the detected package
manager). If no image is found, zames says so and reports which tool it tried,
instead of staying silent.

### Options

```
zames --task <task text>
zames --chat <id>
zames --new-chat
zames --resend-prompt
zames --dir <path>
zames --headless
zames --headed
zames --plan
zames --output-format jsonl
zames --debug
zames --version
zames --help
```

### Machine-readable output (scripts / CI)

For one-shot runs (`--task`) the agent can emit its event stream as JSON lines
on stdout, keeping all human text on stderr:

```bash
zames --task "summarize the diff" --output-format jsonl
```

Each line is one event (`tool_call`, `tool_result`, `assistant_final`, ...), so
it pipes straight into `jq`:

```bash
zames --task "..." --output-format jsonl \
  | jq -r 'select(.type=="assistant_final") | .message'
```

## Tools

The agent has the same style of tools as Claude Code / Codex CLI:

- **File tools** — `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`. `Read`
  returns raw content by default; pass `numbered=true` to get `cat -n`-style
  line numbers (for reference only — do not paste them into `Edit`).
- **Extra tools** — `LS` (list a directory), `MultiEdit` (several edits to one
  file applied atomically), `TodoWrite` (session task checklist), `ApplyPatch`
  (multi-file patch in Codex's V4A format: `*** Begin Patch` … `*** End Patch`).
- **Git** — `GitStatus`, `GitDiff`, `GitLog`, `GitShow`, `GitBranchList`,
  `GitAdd`, `GitCommit`, `GitPush`.
- **Web** — `WebFetch`, `WebSearch`.
- **Service** — `respond` (final answer to the operator, ends the task).

All file tools stay inside the working directory (sandbox). `Write`/`Edit` and
`MultiEdit`/`ApplyPatch` make a backup (undo) before touching a file.

## Slash commands

Type / in the prompt for hints (Tab completes). Besides the session and
config commands (/new, /chats, /resume, /cd, /status, /config,
/undo, /transcript, /mcp, /skills, /memory, /init, /reload,
/debug-dom, /help, /exit) there are a few that mirror Claude Code /
Codex CLI:

- /diff [--staged] — show the working-tree git diff (--staged for the index).
- /diffstat — a one-line change summary (`git diff --stat`).
- /context — show what is loaded into the prompt (AGENTS.md, MEMORY.md,
  skills, custom commands) and the system-prompt size.
- /retry — resend the last task into the same chat (handy after a truncated
  or empty answer).
- /rename <title> — set the current session title (shown in /sessions).
- /copy — copy the last assistant answer to the OS clipboard.
- /cost (alias /usage) — session stats: tasks, tool calls, duration, and the
  context size in tokens (DeepSeek's `accumulated_token_usage`; Qwen
  reports `input_tokens`).
- /export [file] — write the session transcript to a Markdown file
  (zames-export-<stamp>.md by default).
- /doctor — diagnose node, git, config, browser, clipboard, MCP and the
  active chat provider (it also reports that provider's UI health).
- /provider <deepseek|qwen> — switch the chat backend (applied live, no
  restart); /provider status shows the active provider/model/login; /provider
  login re-runs the sign-in check. /model [id] lists or picks a Qwen model at
  runtime.
- /add-dir <path> — validate an extra directory (the sandbox is fixed at
  startup; relaunch with --dir to write there).
- /resume-id <id> (or picking a chat in the /chats list) — open a chat and
  PRINT its dialogue into the terminal, so the restored context is visible. Only the
  last 20 messages are shown (`RESTORED_HISTORY_LIMIT`). /last reopens the last
  chat of the current directory with no lookup step; /sessions shows the saved
  sessions with their relative age.
- /help <command> — the full description of a single command (e.g. `/help diff`)
  instead of the whole list.
- /review [focus] [--staged] — ask the agent to review uncommitted changes
  and report findings (no code changes).
- /plan [on|off] — plan (read-only) mode. While it is on, the mutating tools
  (Write/Edit/MultiEdit/ApplyPatch/Bash, GitAdd/GitCommit/GitPush) are removed
  from the tool set, so the agent can investigate without touching the tree.
  Start in it with `--plan`.
- /compact — ask the active backend to compress the current chat into a handover
  summary, then open a NEW chat, resend the system prompt and post the summary
  as the carried-over context. Use it when the context gets long.
- /goal <condition> — set a **completion condition** (Claude Code parity). The
  agent starts working toward it at once and keeps starting new turns until a
  separate evaluator model judges the condition met. The goal clears itself
  automatically when it is met (or judged impossible), or with `/goal clear`.
  The condition is stored in `<project>/.zames-goal` (git-ignored) and restored
  on the next launch. `/goal` with no argument shows the current state.
- /loop <interval> <task> — repeat a task periodically (e.g. `/loop 10m run the
tests`). /cron "<min> <hour> <dom> <month> <dow>" <task> — run on a schedule.
  /jobs [rm <id>|clear] lists and stops them. A fired job is put into the same
  message queue you type into, so it runs when the agent is free (never mid-
  generation) and still respects the send throttle. The FIRST run of a `/loop`
  is due at once (and runs as soon as the agent is idle); a `/cron` job waits
  for its schedule.
- /thinking [on|off] and /web [on|off] — toggle the reasoning / web-search
  behaviour. On **DeepSeek** these are the "Deep thinking" / "Smart search"
  toggles; on **Qwen** they drive its thinking MODE (Thinking / Fast) and the
  "Web search" item in the "+" menu.
  These (and /queue, /jobs, /goal, `/config <sub>`) can be used WHILE the agent
  is working — they do not touch the in-flight generation.
- /queue [clear] — list or clear the messages waiting to be sent after the
  current task.

The token context is also shown live: the status line above the input has the
spinner/text on the left and the context on the right (e.g. `125k · 13%`,
percent of a 1M context). It is COLORED by fill level: green below 50%,
yellow 50-80%, red above 80%. It comes from the provider's own token
counter (DeepSeek's `accumulated_token_usage`, Qwen's `input_tokens`) and is
hidden until the first answer delivers it.

## Project context, skills and memory

Like Codex / Claude Code, zames reads project instructions and reusable
workflows from your repository and from `~/.zames`.

- **AGENTS.md** — project instructions. Put one in the repo root (or in any
  parent folder of the working directory). Global instructions live in
  `~/.zames/AGENTS.md` (and `~/.claude/CLAUDE.md`). Run `/init` and the agent
  will explore the project and write an AGENTS.md based on the real build/test
  commands and conventions (use `/init --force` to overwrite an existing file).
- **MEMORY.md** — durable notes that persist between sessions. The agent
  appends useful facts here; you can edit it by hand, or add one from the
  prompt with `/remember <text>`.
- **Skills** — a folder with a `SKILL.md` file (YAML frontmatter: `name`,
  `description`, optional `allowed-tools`, `user-invokable`) plus any helper
  files. Discovered under `.zames/skills/`, `.claude/skills/`,
  `.agents/skills/`, `skills/`, and `~/.zames/skills/`. The agent reads the
  body only when a task matches the description. List them with `/skills`;
  invoke one with `/<skill-name>`.
- **Custom commands** — `.md` files under `.zames/commands/` (or
  `.claude/commands/`). They support `$ARGUMENTS` / `{{args}}` placeholders and
  are invoked with `/<command-name>`.

Skills and custom commands show up in the «/» completion list and in `/help`.

```
/skills                       list discovered skills
/memory                       show AGENTS.md / MEMORY.md in effect
/remember <text>              append a durable note to MEMORY.md
/init [--force]               analyze the project and create AGENTS.md
```

## MCP (external tools)

zames can use tools from [MCP](https://modelcontextprotocol.io) servers.
The flagship example is @playwright/mcp: it gives the agent a real browser
(navigate, click, snapshot, type, ...) on top of the one zames already uses
for the DeepSeek or Qwen chat.

Drop a config file (same shape as Claude Code / Cursor):

- `~/.zames/mcp.json` - global
- `<project>/.zames/mcp.json` - project-scoped (later files win)
- `<project>/.mcp.json` - the common MCP name

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless", "--isolated"]
    }
  }
}
```

IMPORTANT: keep the MCP browser isolated. @playwright/mcp defaults to the
SAME profile directory as zames (~/.zames/profile). If it is launched
without --isolated (or without its own --user-data-dir), the MCP browser
and the agent browser fight over one profile and the DeepSeek chat shows
"Something went wrong when opening your profile". Always pass --isolated
as in the example above.
Servers can also be remote ("url": "https://...", "transport": "sse").
Their tools show up in the agent as `server__tool` (e.g.
`playwright__browser_navigate`) and are listed with `/mcp` and in `/status`.
A server that fails to connect is skipped with a warning and never breaks the
agent.

### Recommended servers (verified)

A few small, high-value servers tested end to end with zames (both the
DeepSeek and Qwen backends):

- **Context7** (`@upstash/context7-mcp`) — fetches CURRENT, version-specific
documentation for a library before the agent writes code, instead of relying
on a stale training snapshot. Tools: `resolve_library_id` then `query_docs`.
Verified live on DeepSeek AND Qwen: the agent called both tools and got the
current Zod API. This is the one to add first.

  ```json
  { "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"] } }
  ```

- **Sequential Thinking** (`@modelcontextprotocol/server-sequential-thinking`)
— one `sequentialthinking` tool that gives the model an explicit, revisable
plan before it acts; useful for long multi-step tasks.

- **Memory** (`@modelcontextprotocol/server-memory`) — a local knowledge graph
(9 tools) for durable facts across chats. NOTE: zames already has `MEMORY.md`
+ `AGENTS.md`; add this only if you want a queryable graph.

Keep the stack SMALL: every server loads its tool definitions into the model's
context. Add one when you feel its absence, not before.

## Configuration

Global config: `~/.zames/config.json`
Local (per project): `.zamesrc.json`

You can view and change settings without leaving the agent — use the
`/config` command. Run it without arguments to open an interactive menu
(↑/↓ to move, Enter to change, `d` to reset, `q` to quit). Booleans and enums
toggle in place; numbers and strings open an input prompt.

```
/config                       interactive settings menu
/config list                  print all editable settings
/config get <path>            show a setting
/config set <path> <value>    change a setting
/config reset <path>          reset a setting to its default
/config path                  show config file paths
/config lang <ru|en>          switch interface and agent language
```

Examples:

```
/config set maxIterations 20
/config set browser.deepThinking true   # DeepSeek Deep thinking (slow; reasoning is hidden)
/config set browser.webSearch false     # DeepSeek Smart web search
/config lang en
```

Changes are written to the project `.zamesrc.json` and applied right away
(where possible without a restart).

### Language

`/config lang ru` or `/config lang en` switches both the interface language
(help, messages, spinner) and the language the agent answers you in. The
locale lives in `ui.locale` in the config file.

Agent data is stored in `~/.zames`: browser profile, logs, undo history, sessions.

## FAQ

**Is this an official DeepSeek or Qwen product?**
No. zames drives the public `chat.deepseek.com` / `chat.qwen.ai` web UIs through
a real browser, like a regular user. It is not affiliated with DeepSeek or
Alibaba.

**Do I need an API key?**
No. You sign in with your own account on the chat you use — DeepSeek (stored in
`~/.zames/profile`) or Qwen (stored in `~/.zames/qwen-profile`) — and the session
is reused. Qwen also works in guest mode for a few messages a day.

**Which model does it use?**
Whichever the active web chat uses. On DeepSeek that is DeepSeek-V3 (or the
reasoning model with "Deep thinking" on). On Qwen you can pick a model with
`/model` (e.g. `qwen3.7-plus`). zames never calls the API directly.

**Does it work headless / on a server?**
Yes — headless is the default, and `--output-format jsonl` makes it scriptable.
`--headed` is only needed for a manual sign-in or selector debugging.

**Is automating the web UI allowed?**
That depends on the site's terms; automating a website may violate them. Use at
your own risk and keep the send throttle (15 s on DeepSeek by default) so you do
not hammer the rate limit.

**How is it different from Claude Code / Codex?**
Same shape (tools, `AGENTS.md`, skills, MCP, slash commands) but it runs on your
DeepSeek or Qwen account instead of an API, as a browser automation rather than
a first-party API client.

## Links

- **npm:** <https://www.npmjs.com/package/zames_pro>
- **GitHub:** <https://github.com/Viqto0r/zames_pro>
- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md)
- **Contributing:** [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Security policy:** [`SECURITY.md`](SECURITY.md)
- **Code of conduct:** [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

## License

MIT

<a id="readme-ru" name="readme-ru"></a>
<details>
<summary>🇷🇺 Читать по-русски (Russian)</summary>

Терминальный coding-агент, работающий поверх веб-чатов LLM
([chat.deepseek.com](https://chat.deepseek.com/), [chat.qwen.ai](https://chat.qwen.ai/), …)
через Playwright.
По духу он похож на Claude Code / Codex CLI: запускается в текущей
директории, читает и правит файлы, выполняет команды и коммитит в git.

> API-ключ не нужен — агент управляет веб-чатом DeepSeek или Qwen как обычный
> пользователь через настоящий (headless) браузер.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/demo.png" alt="сессия zames в терминале" width="860">
</p>

## Быстрый старт

```bash
npm install -g zames_pro   # Chromium для Playwright скачается автоматически
cd your-project            # любая папка, в которой должен работать агент
zames                      # один раз войти, дальше просто описывайте задачу
```

Здесь **нет API-ключа и нет оплаты за токены**: zames входит в **ваш
собственный аккаунт [chat.deepseek.com](https://chat.deepseek.com/) или
[chat.qwen.ai](https://chat.qwen.ai/)** в настоящем (headless) Chromium и
управляет веб-чатом как обычный пользователь. При первом запуске он один раз
спросит логин (сессия сохраняется в `~/.zames/profile` для DeepSeek или
`~/.zames/qwen-profile` для Qwen); после этого достаточно запустить `zames` и
написать задачу обычным языком:

```text
❯ отрефактори загрузчик конфига и добавь тест на новый дефолт
```

Пока агент работает, можно продолжать печатать — сообщение, отправленное
посреди задачи, встанет в очередь и уйдёт сразу после неё, в тот же чат.
`Esc` прерывает текущую генерацию, `/help` показывает команды, `/exit` — выход.

## Как это работает

zames не вызывает API модели. Он запускает headless Chromium с постоянным
профилем, входит в веб-чат как человек, печатает задачу в поле чата и читает
ответ обратно.

Доступны два бэкенда, переключаются командой `/provider <deepseek|qwen>`:
**DeepSeek** (`chat.deepseek.com`, по умолчанию) и **Qwen** (`chat.qwen.ai`).
Переключение **живое** — zames закрывает текущий бэкенд и открывает другой на
месте, без перезапуска. У каждого свой постоянный профиль
(`~/.zames/profile` и `~/.zames/qwen-profile`), поэтому переключение не
разлогинивает другой.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png" alt="как работает zames" width="860">
</p>

Словами: вы вводите задачу → zames отправляет системный промпт и задачу в
активный веб-чат (DeepSeek или Qwen) → модель отвечает → zames разбирает
вызов инструмента, выполняет его локально, возвращает результат обратно и
печатает финальный ответ.

Ключевые детали:

- **Ответ читается из сырого сетевого потока** (SSE), а не из отрендеренного
  DOM, поэтому JSON вызова инструмента с шаблонными строками и экранированием
  остаётся целым.
- **Постоянный профиль на каждого провайдера** (`~/.zames/profile` у DeepSeek,
  `~/.zames/qwen-profile` у Qwen) держит вас залогиненным; User-Agent
  headless-браузера подменяется, чтобы CDN сайта не отдавал 403 на вход.
- **Троттлинг отправки** (15 с у DeepSeek, ~1 с у Qwen, который спокойно
  переносит частые отправки) щадит рейт-лимит веб-чата во время долгих
  прогонов с инструментами.
- **Агент запесочен** в директорию запуска — ни один инструмент не может
  читать или писать выше неё.

## Содержание

- [Быстрый старт](#быстрый-старт) · [Возможности](#возможности) · [Почему zames?](#почему-zames) · [Требования](#требования)
- [Как это работает](#как-это-работает) · [Установка](#установка) · [Вход в аккаунт](#вход-в-аккаунт) · [Использование](#использование)
- [Переключение провайдера (DeepSeek / Qwen)](#переключение-провайдера-deepseek--qwen)
- [Инструменты](#инструменты) · [Слэш-команды](#слэш-команды)
- [Контекст проекта, навыки и память](#контекст-проекта-навыки-и-память) · [MCP (внешние инструменты)](#mcp-внешние-инструменты) · [Конфигурация](#конфигурация)
- [FAQ](#faq) · [Ссылки](#ссылки) · [Лицензия](#лицензия)

## Возможности

- **Инструменты как в Claude Code / Codex** — `Read`, `Write`, `Edit`, `Bash`,
  `Glob`, `Grep`, плюс `MultiEdit`, `ApplyPatch`, `LS`, `TodoWrite`, git- и
  веб-инструменты. Каждая правка подкреплена `/undo`.
- **Работает, пока вы печатаете** — сообщения, набранные во время задачи,
  встают в очередь и уходят сразу после неё, в тот же чат (как набор текста
  во время генерации на сайте).
- **Режим плана** — `/plan` (или `--plan`) убирает все мутирующие инструменты,
  чтобы агент изучал код, не трогая дерево.
- **Контекст проекта** — читает `AGENTS.md`, `MEMORY.md`, навыки (`SKILL.md`) и
  пользовательские команды из репозитория и `~/.zames`, как в Codex / Claude
  Code.
- **Субагенты** — инструмент `Task` поручает самодостаточную подзадачу агенту
  в отдельном чате (изолированный контекст), который возвращает только отчёт,
  так что тяжёлая разведка не засоряет основной контекст. Включены по
  умолчанию; настраиваются через `browser.subagents` / `browser.maxSubagents`.
- **Поддержка MCP** — подключение внешних серверов инструментов (например,
  `@playwright/mcp`).
- **Планировщик** — `/loop`, `/cron` и `/jobs` повторяют задачи по таймеру.
- **Двуязычный интерфейс** — русский / английский (`/config lang`).

## Почему zames?

- **Разрабатывается сам собой** — над `zames_pro` работает `zames_pro`, а не
  какой-то другой кодинг-агент: агент в этом самом терминале читает исходники,
  гоняет тесты, чинит баги и коммитит результат. Это ежедневное доказательство,
  что он работает и реально используется.
- **Нет API-ключа и счёта за токены** — используется ваш собственный аккаунт
  чата DeepSeek или Qwen, а не платный API. Удобно для долгих задач с
  инструментами.
- **Тот же рабочий процесс, что в Claude Code / Codex** — инструменты,
  `AGENTS.md`, навыки, MCP и слэш-команды, так что всё знакомо с первого дня.
- **Работает без присмотра** — headless по умолчанию, возобновляемые сессии,
  `/loop` и `/cron` для задач по расписанию.
- **Local-first** — профиль браузера, учётные данные и логи не покидают вашу
  машину, а агент запесочен в директорию проекта.

## Требования

- Node.js >= 20
- Аккаунт в нужном чате — **DeepSeek** (`chat.deepseek.com`, по умолчанию) или
  **Qwen** (`chat.qwen.ai`). Qwen также работает в гостевом режиме на несколько
  сообщений. При первом запуске zames спросит логин в терминале (и сохранит его
  в `~/.zames/config.json` после успешного входа, поэтому более поздний
  разлогин обрабатывается автоматически, без повторных вопросов). Можно также
  войти вручную в окне браузера, когда он headed.

## Вход в аккаунт

Браузер по умолчанию работает **headless**. Когда активный бэкенд требует
входа, zames:

1. переиспользует сессию из постоянного профиля (`~/.zames/profile` для
   DeepSeek, `~/.zames/qwen-profile` для Qwen), если она ещё валидна;
2. иначе входит автоматически по сохранённым учётным данным
   (`browser.auth.username` / `browser.auth.password`);
3. иначе спрашивает логин/пароль в терминале (в TTY) и после успешного входа
   запоминает их для следующего раза;
4. иначе показывает подсказку про ручной вход.

Чтобы войти руками (например, если сайт показывает капчу), запустите с
видимым окном:

```bash
zames --headed
```

Флаг `--headless` (значение по умолчанию) и `headless: true` в конфиге держат
браузер без окна; `--headed` / `headless: false` показывают его.

Headless работает из коробки: headless Chrome обычно представляется как
`HeadlessChrome/...`, и CDN сайта блокирует такой User-Agent ответом 403,
поэтому zames срезает этот маркер перед загрузкой страницы (сохраняя реальную
версию движка). `--headed` нужен не только ради входа.

Учётные данные и переключатели можно также править из `/config`
(`browser.auth.username`, `browser.auth.password`, `browser.auth.saveSession`).

## Переключение провайдера (DeepSeek / Qwen)

zames умеет работать с **DeepSeek** (`chat.deepseek.com`, по умолчанию) и
**Qwen** (`chat.qwen.ai`):

```bash
/provider qwen      # переключиться на Qwen (сохраняется) — применяется сразу
/provider deepseek  # вернуться обратно
/provider status    # активный провайдер / модель / статус входа
/provider login     # повторно пройти проверку входа
/model              # список моделей Qwen
/model qwen3.7-plus # выбрать модель
```

Замечания:

- Переключение **живое**: zames закрывает текущий бэкенд и открывает другой на
  месте, перезапуск не нужен. У бэкендов **разные постоянные профили**
  (`~/.zames/profile` у DeepSeek, `~/.zames/qwen-profile` у Qwen), поэтому
  переключение не разлогинивает другой.
- id чата принадлежит ОДНОМУ бэкенду, поэтому новый провайдер открывает
  **свежий чат**. Если в прошлом чате были сообщения, они сжимаются и
  подставляются как handoff в следующую задачу; пустой чат переключается молча.
- Qwen работает в **гостевом режиме** без аккаунта, но гостю доступно всего
  несколько сообщений в день; для долгих прогонов войдите (email / Google /
  GitHub — телефон не нужен). zames сам логинится по сохранённым кредам или
  спросит в терминале, как и с DeepSeek. `/model` меняет модель Qwen на лету.
- Вложения в Qwen идут через пункт **Upload attachment** в меню режима; в
  DeepSeek — своя скрепка.
- `/doctor` показывает активный провайдер и состояние UI его страницы.

## Установка

```bash
npm install -g zames_pro
```

Chromium для Playwright скачивается автоматически при установке. На Linux/WSL
необходимые системные библиотеки тоже ставятся, если доступен `sudo` без
пароля; иначе выполните один раз вручную:

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium
```

## Использование

Перейдите в папку проекта и запустите:

```bash
zames
```

Агент работает внутри директории, из которой он запущен, и не может её покинуть (песочница).

Пока агент работает, можно продолжать печатать: Enter ставит сообщение в
очередь (оно уйдёт сразу после текущей задачи, в тот же чат), а Esc / Ctrl+C
прерывают текущую генерацию. Это повторяет набор текста во время генерации на
сайте чата.

### Строка ввода

Промпт — это небольшой редактор строки с постоянной историей:

- `↑` / `↓` — переход по истории сообщений (сохраняется в
  `~/.zames/history.json`, поэтому переживает перезапуск); внутри
  многострочного сообщения стрелки двигают по строкам.
- `Ctrl+R` — инкрементальный поиск по истории в обратном порядке (как в bash):
  печатайте для фильтра, `Ctrl+R` — за более старыми совпадениями, `Enter` —
  принять, `Esc` — отменить.
- `Ctrl+_` — отменить последнюю правку строки ввода (случайно нажатые
  `Ctrl+U` / `Ctrl+K` можно вернуть).
- `Ctrl+U` — очистить строку, `Ctrl+K` — удалить до конца строки, `Ctrl+W` —
  удалить слово перед курсором, `Ctrl+←`/`Ctrl+→` — переход по словам.
- `\` + `Enter`, `Ctrl+J`, `Ctrl+Enter` или `Shift+Enter` — вставить новую
  строку.
- `/` + `Tab` — подсказки и автодополнение слэш-команд.
- `!команда` — выполнить shell-команду напрямую, минуя модель (как bash-режим
  Claude Code). Действует та же песочница, что и для инструмента `Bash`, так
  что прямая команда тоже не может выйти за пределы проекта.

В полноэкранном режиме добавляется навигация по диалогу, чтобы длинный ответ
можно было прочитать и выделить не покидая терминал:

- `ui.mouseScroll=false` (по умолчанию) — терминал владеет мышью: обычное
  выделение текста работает, колесо инертно (и никогда не листает историю
  ввода — история только стрелками).
- `ui.mouseScroll=true` — приложение перехватывает колесо и скроллит диалог;
  выделение текста тогда — `Shift`+клик (стандарт TUI).
- `PgUp` / `PgDn` — вверх/вниз по диалогу на пол-экрана.
- `Home` / `End` — прыжок в самый верх / низ диалога (только когда строка ввода
  пуста; при набранном тексте они двигают курсор, как обычно).
- Чтобы скопировать БОЛЬШОЙ кусок, используйте `/export` (пишет всю сессию в
  Markdown) или файл транскрипта (`/transcript` покажет путь) — собственным
  выделением терминала за пределы одного экрана не выделить.

Установите `NO_COLOR=1`, чтобы отключить цвета (иначе используется спокойная
палитра по умолчанию).

### Картинки и файлы

В строку ввода можно вставить картинку или файл (Ctrl+Shift+V / Shift+Insert
или собственной вставкой терминала). zames сохраняет его в `<project>/tmp` и
показывает маркер в строке — `[image#1]` для картинок, `[file#1]` для прочих
файлов — затем загружает реальный файл в чат вместе с вашим сообщением. Это те
же форматы, что принимает веб-чат DeepSeek / Qwen (PNG, JPEG, GIF, WEBP, BMP,
SVG и обычные типы документов).

Вставка картинки работает, когда терминал передаёт её как `data:` URL или как
base64-блок с узнаваемой сигнатурой изображения. Можно также вставить путь к
локальному файлу (перетащите файл в терминал или скопируйте его путь); если
файл существует — он прикрепляется, иначе текст вставляется как обычно.

Нажмите Ctrl+V (или сделайте пустую вставку), и zames прочитает картинку прямо
из буфера обмена: Linux через wl-paste (Wayland) или xclip/xsel (X11), macOS
через pngpaste, Windows через PowerShell. Нужные Linux-утилиты ставятся
автоматически при `npm install` (best-effort, через определённый пакетный
менеджер). Если картинка не найдена, zames сообщит об этом и напишет, какой
инструмент пробовал, вместо молчания.

### Опции

```
zames --task <текст задачи>
zames --chat <id>
zames --new-chat
zames --resend-prompt
zames --dir <path>
zames --headless
zames --headed
zames --plan
zames --output-format jsonl
zames --debug
zames --version
zames --help
```

### Машиночитаемый вывод (скрипты / CI)

Для одноразовых запусков (`--task`) агент может выдавать поток событий как JSON
lines в stdout, оставляя весь человеческий текст в stderr:

```bash
zames --task "summarize the diff" --output-format jsonl
```

Каждая строка — одно событие (`tool_call`, `tool_result`, `assistant_final`, …),
так что это сразу пайпится в `jq`:

```bash
zames --task "..." --output-format jsonl \
  | jq -r 'select(.type=="assistant_final") | .message'
```

## Инструменты

У агента тот же стиль инструментов, что в Claude Code / Codex CLI:

- **Файловые** — `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`. `Read` по
  умолчанию отдаёт сырое содержимое; передайте `numbered=true`, чтобы получить
  нумерацию строк в стиле `cat -n` (только для справки — не вставляйте её в
  `Edit`).
- **Дополнительные** — `LS` (список директории), `MultiEdit` (несколько правок
  одного файла атомарно), `TodoWrite` (чек-лист задач сессии), `ApplyPatch`
  (мультифайловый патч в формате V4A от Codex: `*** Begin Patch` … `*** End Patch`).
- **Git** — `GitStatus`, `GitDiff`, `GitLog`, `GitShow`, `GitBranchList`,
  `GitAdd`, `GitCommit`, `GitPush`.
- **Web** — `WebFetch`, `WebSearch`.
- **Служебный** — `respond` (финальный ответ оператору, завершает задачу).

Все файловые инструменты остаются внутри рабочей директории (песочница).
`Write`/`Edit` и `MultiEdit`/`ApplyPatch` делают резервную копию (undo) перед
изменением файла.

## Слэш-команды

Введите / в промпте для подсказок (Tab дополняет). Кроме команд сессии и
конфига (/new, /chats, /resume, /cd, /status, /config, /undo, /transcript,
/mcp, /skills, /memory, /init, /reload, /debug-dom, /help, /exit) есть
несколько в духе Claude Code / Codex CLI:

- /diff [--staged] — показать git-диф рабочего дерева (--staged для индекса).
- /diffstat — сводка изменений одной строкой (`git diff --stat`).
- /context — показать, что загружено в промпт (AGENTS.md, MEMORY.md, навыки,
  пользовательские команды) и размер системного промпта.
- /retry — отправить последнюю задачу в тот же чат заново (удобно после
  обрезанного или пустого ответа).
- /rename <title> — задать заголовок текущей сессии (виден в /sessions).
- /copy — скопировать последний ответ ассистента в буфер обмена ОС.
- /cost (алиас /usage) — статистика сессии: задачи, вызовы инструментов,
  длительность и размер контекста в токенах (у DeepSeek —
  `accumulated_token_usage`, у Qwen — `input_tokens`).
- /export [file] — записать транскрипт сессии в Markdown-файл
  (по умолчанию zames-export-<stamp>.md).
- /doctor — диагностика node, git, конфига, браузера, буфера обмена, MCP и
  активного провайдера чата (плюс состояние UI его страницы).
- /provider <deepseek|qwen> — сменить бэкенд чата (применяется сразу, без
  перезапуска); /provider status показывает активный провайдер/модель/вход;
  /provider login повторно проверяет вход. /model [id] покажет или выберет
  модель Qwen на лету.
- /add-dir <path> — проверить дополнительную директорию (песочница
  фиксируется при старте; для записи туда перезапустите с --dir).
- /resume-id <id> (или выбор чата в списке /chats) — открыть чат и
  НАПЕЧАТАТЬ его диалог в терминал, чтобы восстановленный контекст был виден. Показываются
  только последние 20 сообщений (`RESTORED_HISTORY_LIMIT`). /last открывает
  последний чат текущей директории без поиска; /sessions показывает сохранённые
  сессии с их относительным возрастом.
- /help <command> — полное описание одной команды (например, `/help diff`)
  вместо всего списка.
- /review [focus] [--staged] — попросить агента проверить незакоммиченные
  изменения и сообщить находки (без правок кода).
- /plan [on|off] — режим плана (только чтение). Пока он включён, мутирующие
  инструменты (Write/Edit/MultiEdit/ApplyPatch/Bash, GitAdd/GitCommit/GitPush)
  убраны из набора, чтобы агент изучал код, не трогая дерево. Стартовать в нём
  можно с `--plan`.
- /compact — попросить активный бэкенд сжать текущий чат в передаточное резюме,
  затем открыть НОВЫЙ чат, заново отправить системный промпт и положить резюме как
  перенесённый контекст. Используйте, когда контекст разрастается.
- /goal <условие> — задать **условие завершения** (как в Claude Code). Агент
  сразу начинает работать над ним и продолжает запускать новые ходы, пока
  отдельная модель-оценщик не признает условие выполненным. Цель снимается
  автоматически при достижении (или если оценщик признал её недостижимой),
  либо командой `/goal clear`. Условие хранится в `<project>/.zames-goal`
  (git-ignored) и восстанавливается при следующем запуске. `/goal` без
  аргумента показывает текущее состояние.
- /loop <interval> <task> — повторять задачу периодически (например,
  `/loop 10m run the tests`). /cron "<min> <hour> <dom> <month> <dow>" <task> —
  запуск по расписанию. /jobs [rm <id>|clear] перечисляет и останавливает их.
  Сработавшая задача попадает в ту же очередь сообщений, что и ваш ввод, так
  что выполняется, когда агент свободен (никогда посреди генерации), и всё
  равно соблюдает троттлинг отправки. ПЕРВЫЙ запуск `/loop` — сразу же (как
  только агент свободен); задача `/cron` ждёт своего расписания.
- /thinking [on|off] и /web [on|off] — переключить режим размышления /
  веб-поиска. В **DeepSeek** это тумблеры «Deep thinking» / «Smart search»;
  в **Qwen** — это режим размышления (Thinking / Fast) и пункт «Web search»
  в меню «+».
  Их (а также /queue, /jobs, /goal, `/config <sub>`) можно использовать, ПОКА
  агент работает — они не трогают текущую генерацию.
- /queue [clear] — показать или очистить сообщения, ждущие отправки после
  текущей задачи.

Контекст в токенах показывается и вживую: в строке статуса над вводом слева
спиннер/текст, справа — контекст (например, `125k · 13%`, процент от 1M
контекста). Он ОКРАШЕН по уровню заполнения: зелёный ниже 50%, жёлтый 50-80%,
красный выше 80%. Значение приходит из счётчика токенов провайдера (у DeepSeek —
`accumulated_token_usage`, у Qwen — `input_tokens`) и скрыто до первого ответа.

## Контекст проекта, навыки и память

Как в Codex / Claude Code, zames читает инструкции проекта и переиспользуемые
процессы из вашего репозитория и из `~/.zames`.

- **AGENTS.md** — инструкции проекта. Положите его в корень репозитория (или в
  любую родительскую папку рабочей директории). Глобальные инструкции живут в
  `~/.zames/AGENTS.md` (и `~/.claude/CLAUDE.md`). Запустите `/init`, и агент
  изучит проект и напишет AGENTS.md на основе реальных команд сборки/тестов и
  соглашений (`/init --force` перезапишет существующий файл).
- **MEMORY.md** — долговечные заметки, переживающие сессии. Агент дописывает
  сюда полезные факты; можно править вручную или добавить из промпта через
  `/remember <text>`.
- **Навыки** — папка с файлом `SKILL.md` (YAML-фронтматтер: `name`,
  `description`, опционально `allowed-tools`, `user-invokable`) плюс любые
  вспомогательные файлы. Ищутся в `.zames/skills/`, `.claude/skills/`,
  `.agents/skills/`, `skills/` и `~/.zames/skills/`. Агент читает тело только
  когда задача совпадает с описанием. Список — `/skills`; вызов —
  `/<skill-name>`.
- **Пользовательские команды** — `.md`-файлы в `.zames/commands/` (или
  `.claude/commands/`). Поддерживают подстановки `$ARGUMENTS` / `{{args}}` и
  вызываются как `/<command-name>`.

Навыки и пользовательские команды видны в списке автодополнения «/» и в
`/help`.

```
/skills                       список найденных навыков
/memory                       показать действующие AGENTS.md / MEMORY.md
/remember <text>              дописать долговечную заметку в MEMORY.md
/init [--force]               проанализировать проект и создать AGENTS.md
```

## MCP (внешние инструменты)

zames может использовать инструменты с серверов [MCP](https://modelcontextprotocol.io).
Главный пример — @playwright/mcp: он даёт агенту настоящий браузер
(navigate, click, snapshot, type, ...) поверх того, который zames уже
использует для чата DeepSeek или Qwen.

Положите файл конфига (той же формы, что в Claude Code / Cursor):

- `~/.zames/mcp.json` — глобальный
- `<project>/.zames/mcp.json` — на уровне проекта (поздние файлы побеждают)
- `<project>/.mcp.json` — привычное имя MCP

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless", "--isolated"]
    }
  }
}
```

ВАЖНО: держите MCP-браузер изолированным. @playwright/mcp по умолчанию
использует ТУ ЖЕ директорию профиля, что и zames (~/.zames/profile). Если
запустить его без --isolated (или без собственного --user-data-dir),
MCP-браузер и браузер агента подерутся за один профиль, и чат DeepSeek
покажет «Something went wrong when opening your profile». Всегда передавайте
--isolated, как в примере выше.
Серверы бывают и удалёнными ("url": "https://...", "transport": "sse").
Их инструменты видны агенту как `server__tool` (например,
`playwright__browser_navigate`) и перечисляются в `/mcp` и `/status`.
Сервер, который не смог подключиться, пропускается с предупреждением и
никогда не роняет агента.

### Рекомендованные серверы (проверены)

Несколько небольших полезных серверов, протестированных вживую с zames
(на обоих бэкендах — DeepSeek и Qwen):

- **Context7** (`@upstash/context7-mcp`) — подтягивает АКТУАЛЬНУЮ
документацию библиотеки (для конкретной версии) до того, как агент пишет код,
вместо устаревших знаний из обучения. Инструменты: `resolve_library_id`, затем
`query_docs`. Проверено вживую на DeepSeek И Qwen: агент вызвал оба инструмента
и получил актуальный API Zod. Именно его стоит подключить первым.

  ```json
  { "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"] } }
  ```

- **Sequential Thinking** (`@modelcontextprotocol/server-sequential-thinking`)
— один инструмент `sequentialthinking`, дающий модели явный пересматриваемый
план перед действием; полезно для длинных многошаговых задач.

- **Memory** (`@modelcontextprotocol/server-memory`) — локальный граф знаний
(9 инструментов) для долговременных фактов между чатами. ВНИМАНИЕ: у zames уже
есть `MEMORY.md` + `AGENTS.md`; подключайте, только если нужен граф с запросами.

Держите набор МАЛЕНЬКИМ: каждый сервер грузит описания своих инструментов в
контекст модели. Добавляйте, когда почувствовали нехватку, а не заранее.

## Конфигурация

Глобальный конфиг: `~/.zames/config.json`
Локальный (на проект): `.zamesrc.json`

Просматривать и менять настройки можно не выходя из агента — командой
`/config`. Запустите её без аргументов, чтобы открыть интерактивное меню
(↑/↓ — навигация, Enter — изменение, `d` — сброс, `q` — выход). Булевы и
enum переключаются на месте; числа и строки открывают ввод.

```
/config                       интерактивное меню настроек
/config list                  показать все изменяемые настройки
/config get <path>            показать настройку
/config set <path> <value>    изменить настройку
/config reset <path>          сбросить настройку к дефолту
/config path                  показать пути файлов конфига
/config lang <ru|en>          переключить язык интерфейса и агента
```

Примеры:

```
/config set maxIterations 20
/config set browser.deepThinking true   # DeepSeek Deep thinking (медленно; рассуждения скрыты)
/config set browser.webSearch false     # DeepSeek Smart web search
/config lang en
```

Изменения пишутся в проектный `.zamesrc.json` и применяются сразу (где это
возможно без перезапуска).

### Язык

`/config lang ru` или `/config lang en` переключает и язык интерфейса
(справка, сообщения, спиннер), и язык, на котором агент вам отвечает. Локаль
хранится в `ui.locale` в файле конфига.

Данные агента хранятся в `~/.zames`: профиль браузера, логи, история undo,
сессии.

## FAQ

**Это официальный продукт DeepSeek или Qwen?**
Нет. zames управляет публичными веб-интерфейсами `chat.deepseek.com` /
`chat.qwen.ai` через настоящий браузер, как обычный пользователь. Он не связан
ни с DeepSeek, ни с Alibaba.

**Нужен ли API-ключ?**
Нет. Вы один раз входите в свой аккаунт на нужном чате — DeepSeek (хранится в
`~/.zames/profile`) или Qwen (хранится в `~/.zames/qwen-profile`) — и сессия
переиспользуется. Qwen также работает в гостевом режиме на несколько сообщений.

**Какую модель он использует?**
Ту, которую использует активный веб-чат. В DeepSeek это DeepSeek-V3 (или
reasoning-модель при включённом «Deep thinking»). В Qwen модель можно выбрать
командой `/model` (например, `qwen3.7-plus`). zames никогда не вызывает API
напрямую.

**Работает ли headless / на сервере?**
Да — headless по умолчанию, а `--output-format jsonl` делает его скриптуемым.
`--headed` нужен только для ручного входа или отладки селекторов.

**Разрешена ли автоматизация веб-интерфейса?**
Это зависит от условий сайта; автоматизация сайта может их нарушать.
Используйте на свой риск и держите троттлинг отправки (15 с в DeepSeek по
умолчанию), чтобы не бить по рейт-лимиту.

**Чем отличается от Claude Code / Codex?**
Та же форма (инструменты, `AGENTS.md`, навыки, MCP, слэш-команды), но работает
на вашем аккаунте DeepSeek или Qwen вместо API, как автоматизация браузера, а
не first-party API-клиент.

## Ссылки

- **npm:** <https://www.npmjs.com/package/zames_pro>
- **GitHub:** <https://github.com/Viqto0r/zames_pro>
- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md)
- **Contributing:** [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Security policy:** [`SECURITY.md`](SECURITY.md)
- **Code of conduct:** [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

## Лицензия

MIT

</details>
