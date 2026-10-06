# zames_pro

[![npm version](https://img.shields.io/npm/v/zames_pro.svg)](https://www.npmjs.com/package/zames_pro)
[![npm downloads](https://img.shields.io/npm/dm/zames_pro.svg)](https://www.npmjs.com/package/zames_pro)
[![tests](https://github.com/Viqto0r/zames_pro/actions/workflows/test.yml/badge.svg)](https://github.com/Viqto0r/zames_pro/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

![zames logo](https://raw.githubusercontent.com/Viqto0r/zames_pro/master/logo.jpg)

A terminal coding agent that works on top of [chat.deepseek.com](https://chat.deepseek.com/) through Playwright.
In spirit it is similar to Claude Code / Codex CLI: it starts in the current
directory, reads and edits files, runs commands, and commits to git.

> No API key required — it drives the DeepSeek web chat like a regular user
> through a real (headless) browser.

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
- **MCP support** — plug in external tool servers (e.g. `@playwright/mcp`).
- **Scheduling** — `/loop`, `/cron` and `/jobs` repeat tasks on a timer.
- **Bilingual UI** — Russian / English (`/config lang`).

## Why zames?

- **No API key, no per-token bill** — it uses your own DeepSeek chat account,
  not the paid API. Good for long, tool-heavy tasks.
- **Same workflow as Claude Code / Codex** — tools, `AGENTS.md`, skills, MCP
  and slash commands, so it feels familiar from day one.
- **Runs unattended** — headless by default, resumable sessions, and `/loop`
  plus `/cron` for scheduled work.
- **Local-first** — the browser profile, credentials and logs never leave your
  machine, and the agent is sandboxed to the project directory.

## Requirements

- Node.js >= 20
- A DeepSeek account. On first launch zames asks for your DeepSeek
  login/password in the terminal (and stores them in `~/.zames/config.json`
  after a successful sign-in, so a later logout is handled automatically
  without asking you again). You can also sign in manually in the browser
  window when the browser is headed.

## Signing in

The browser runs **headless by default**. When DeepSeek requires a sign-in,
zames:

1. reuses the session stored in the persistent profile (`~/.zames/profile`)
   if it is still valid;
2. otherwise signs in automatically with the saved credentials
   (`browser.auth.username` / `browser.auth.password`);
3. otherwise asks you for the login/password in the terminal (in a TTY) and,
   after a successful sign-in, remembers them for next time;
4. otherwise falls back to a manual sign-in hint.

To sign in by hand (for example, if DeepSeek shows a captcha), run with a
visible window:

```bash
zames --headed
```

The `--headless` flag (the default) and `headless: true` in the config keep
the browser without a window; `--headed` / `headless: false` show it.

Headless works out of the box: a headless Chrome normally advertises a
`HeadlessChrome/...` User-Agent that DeepSeek's CDN blocks with a 403, so
zames strips that marker before loading the page (keeping the real engine
version). You do not need `--headed` just to log in.

Credentials and toggles can also be edited from `/config`
(`browser.auth.username`, `browser.auth.password`, `browser.auth.saveSession`).

## Links

- npm: <https://www.npmjs.com/package/zames_pro>
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

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
DeepSeek website.

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

Set `NO_COLOR=1` to disable colors (a calm default palette is used otherwise).

### Images and files

You can paste an image or a file into the input line (Ctrl+Shift+V / Shift+Insert
or the terminal's own paste). zames saves it under `<project>/tmp` and shows a
marker in the line - `[image#1]` for images, `[file#1]` for other files - then
uploads the real file to the chat together with your message. These are the
same formats the DeepSeek web chat accepts (PNG, JPEG, GIF, WEBP, BMP, SVG and
the usual document types).

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
  context size in tokens (DeepSeek's `accumulated_token_usage`).
- /export [file] — write the session transcript to a Markdown file
  (zames-export-<stamp>.md by default).
- /doctor — diagnose node, git, config, browser, clipboard and MCP.
- /add-dir <path> — validate an extra directory (the sandbox is fixed at
  startup; relaunch with --dir to write there).
- /resume <n> (after /chats) and /resume-id <id> — open a chat and PRINT its
  dialogue into the terminal, so the restored context is visible. Only the
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
- /compact — ask DeepSeek to compress the current chat into a handover
  summary, then open a NEW chat, resend the system prompt and post the summary
  as the carried-over context. Use it when the context gets long.
- /goal [text|clear] — set a long-lived session goal. It is prepended to every
  task message, so the model keeps the big picture across many turns. Stored in
  `<project>/.zames-goal` (git-ignored) and restored on the next launch.
- /loop <interval> <task> — repeat a task periodically (e.g. `/loop 10m run the
tests`). /cron "<min> <hour> <dom> <month> <dow>" <task> — run on a schedule.
  /jobs [rm <id>|clear] lists and stops them. A fired job is put into the same
  message queue you type into, so it runs when the agent is free (never mid-
  generation) and still respects the send throttle.
- /thinking [on|off] and /web [on|off] — toggle Deep thinking / Smart search.
  These (and /queue, /jobs, /goal, `/config <sub>`) can be used WHILE the agent
  is working — they do not touch the in-flight generation.
- /queue [clear] — list or clear the messages waiting to be sent after the
  current task.

The token context is also shown live: the status line above the input has the
spinner/text on the left and the context on the right (e.g. `125k · 13%`,
percent of a 1M context). It is COLORED by fill level: green below 50%,
yellow 50-80%, red above 80%. It comes from DeepSeek's
`accumulated_token_usage` and is hidden until the first answer delivers it.

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
for the DeepSeek chat.

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

**Is this an official DeepSeek product?**
No. zames drives the public chat.deepseek.com web UI through a real browser,
like a regular user. It is not affiliated with DeepSeek.

**Do I need an API key?**
No. You sign in with your own DeepSeek account once; the session is stored in
`~/.zames/profile` and reused.

**Which model does it use?**
Whichever the DeepSeek web chat uses (DeepSeek-V3, or the reasoning model with
"Deep thinking" on). zames never calls the API directly.

**Does it work headless / on a server?**
Yes — headless is the default, and `--output-format jsonl` makes it scriptable.
`--headed` is only needed for a manual sign-in or selector debugging.

**Is automating the web UI allowed?**
That depends on DeepSeek's terms; automating a website may violate them. Use at
your own risk and keep the send throttle (15s by default) so you do not hammer
the rate limit.

**How is it different from Claude Code / Codex?**
Same shape (tools, `AGENTS.md`, skills, MCP, slash commands) but it runs on your
DeepSeek account instead of an API, as a browser automation rather than a
first-party API client.

## License

MIT
