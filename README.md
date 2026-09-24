# zames_pro

![zames logo](https://raw.githubusercontent.com/Viqto0r/zames_pro/master/logo.png)

A terminal coding agent that works on top of [chat.deepseek.com](https://chat.deepseek.com/) through Playwright.
In spirit it is similar to Claude Code / Codex CLI: it starts in the current
directory, reads and edits files, runs commands, and commits to git.

## Requirements

- Node.js >= 18
- A DeepSeek account (you log in manually in the browser window that opens on first launch)

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
zames --debug
zames --version
zames --help
```

## Tools

The agent has the same style of tools as Claude Code / Codex CLI:

- **File tools** — `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`. `Read`
  returns raw content by default; pass `numbered=true` to get `cat -n`-style
  line numbers (for reference only — do not paste them into `Edit`).
- **Extra tools** — `LS` (list a directory), `MultiEdit` (several edits to one
  file applied atomically), `TodoWrite` (session task checklist), `ApplyPatch`
  (multi-file patch in Codex's V4A format: `*** Begin Patch` … `*** End Patch`).
- **Git** — `GitStatus`, `GitDiff`, `GitLog`, `GitAdd`, `GitCommit`, `GitPush`.
- **Web** — `WebFetch`, `WebSearch`.
- **Service** — `respond` (final answer to the operator, ends the task).

All file tools stay inside the working directory (sandbox). `Write`/`Edit` and
`MultiEdit`/`ApplyPatch` make a backup (undo) before touching a file.

## Project context, skills and memory

Like Codex / Claude Code, zames reads project instructions and reusable
workflows from your repository and from `~/.zames`.

- **AGENTS.md** — project instructions. Put one in the repo root (or in any
  parent folder of the working directory). Global instructions live in
  `~/.zames/AGENTS.md` (and `~/.claude/CLAUDE.md`). Run `/init` and the agent
  will explore the project and write an AGENTS.md based on the real build/test
  commands and conventions (use `/init --force` to overwrite an existing file).
- **MEMORY.md** — durable notes that persist between sessions. The agent
  appends useful facts here; you can edit it by hand.
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
/config set confirmation.bash false
/config lang en
```

Changes are written to the project `.zamesrc.json` and applied right away
(where possible without a restart).

### Language

`/config lang ru` or `/config lang en` switches both the interface language
(help, messages, spinner) and the language the agent answers you in. The
locale lives in `ui.locale` in the config file.

Agent data is stored in `~/.zames`: browser profile, logs, undo history, self-review snapshots.

## License

MIT
