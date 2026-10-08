<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/logo-small.jpg" alt="zames logo" width="430">
</p>

<h1 align="center">zames_pro</h1>

<p align="center">
  <strong>A terminal coding agent that drives chat.deepseek.com through Playwright — no API key required.</strong>
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

A terminal coding agent that works on top of [chat.deepseek.com](https://chat.deepseek.com/) through Playwright.
In spirit it is similar to Claude Code / Codex CLI: it starts in the current
directory, reads and edits files, runs commands, and commits to git.

> No API key required — it drives the DeepSeek web chat like a regular user
> through a real (headless) browser.

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
[chat.deepseek.com](https://chat.deepseek.com/) account** in a real (headless)
Chromium and drives the web chat like a regular user. The first launch asks for
your DeepSeek login once (the session is stored in `~/.zames/profile`); after
that just run `zames` and type a task in plain language:

```text
❯ refactor the config loader and add a test for the new default
```

While the agent works you can keep typing — a message sent mid-task is queued
and runs right after it, in the same chat. `Esc` aborts the current generation,
`/help` lists commands, `/exit` quits.

## How it works

zames does not call the model API. It launches a headless Chromium with a
persistent profile, signs in to `chat.deepseek.com` like a human, types the task
into the chat box, and reads the answer back.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png" alt="how zames works" width="860">
</p>

In text: you type a task → zames sends the system prompt plus the task into
the DeepSeek web chat → the model answers → zames parses the tool call, runs
the tool locally, feeds the result back, and prints the final answer for you.

Key pieces:

- **The answer is read from the raw network stream** (SSE), not the rendered
  DOM, so tool-call JSON with template strings and escapes survives intact.
- **A persistent profile** (`~/.zames/profile`) keeps you signed in; the
  headless User-Agent is patched so DeepSeek's CDN does not 403 the login.
- **A send throttle** (15 s by default) keeps the web chat's rate limit happy
  during long tool-heavy runs.
- **The agent is sandboxed** to the directory it was started in — no tool can
  read or write above it.

## Table of contents

- [Quick start](#quick-start) · [Features](#features) · [Why zames?](#why-zames) · [Requirements](#requirements)
- [How it works](#how-it-works) · [Installation](#installation) · [Signing in](#signing-in) · [Usage](#usage)
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

Терминальный coding-агент, работающий поверх [chat.deepseek.com](https://chat.deepseek.com/) через Playwright.
По духу он похож на Claude Code / Codex CLI: запускается в текущей
директории, читает и правит файлы, выполняет команды и коммитит в git.

> API-ключ не нужен — агент управляет веб-чатом DeepSeek как обычный
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
собственный аккаунт [chat.deepseek.com](https://chat.deepseek.com/)** в
настоящем (headless) Chromium и управляет веб-чатом как обычный пользователь.
При первом запуске он один раз спросит логин DeepSeek (сессия сохраняется в
`~/.zames/profile`); после этого достаточно запустить `zames` и написать
задачу обычным языком:

```text
❯ отрефактори загрузчик конфига и добавь тест на новый дефолт
```

Пока агент работает, можно продолжать печатать — сообщение, отправленное
посреди задачи, встанет в очередь и уйдёт сразу после неё, в тот же чат.
`Esc` прерывает текущую генерацию, `/help` показывает команды, `/exit` — выход.

## Как это работает

zames не вызывает API модели. Он запускает headless Chromium с постоянным
профилем, входит в `chat.deepseek.com` как человек, печатает задачу в поле
чата и читает ответ обратно.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png" alt="как работает zames" width="860">
</p>

Словами: вы вводите задачу → zames отправляет системный промпт и задачу в
веб-чат DeepSeek → модель отвечает → zames разбирает вызов инструмента,
выполняет его локально, возвращает результат обратно и печатает финальный
ответ.

Ключевые детали:

- **Ответ читается из сырого сетевого потока** (SSE), а не из отрендеренного
  DOM, поэтому JSON вызова инструмента с шаблонными строками и экранированием
  остаётся целым.
- **Постоянный профиль** (`~/.zames/profile`) держит вас залогиненным;
  User-Agent headless-браузера подменяется, чтобы CDN DeepSeek не отдавал 403
  на вход.
- **Троттлинг отправки** (15 с по умолчанию) щадит рейт-лимит веб-чата во
  время долгих прогонов с инструментами.
- **Агент запесочен** в директорию запуска — ни один инструмент не может
  читать или писать выше неё.

## Содержание

- [Быстрый старт](#быстрый-старт) · [Возможности](#возможности) · [Почему zames?](#почему-zames) · [Требования](#требования)
- [Как это работает](#как-это-работает) · [Установка](#установка) · [Вход в аккаунт](#вход-в-аккаунт) · [Использование](#использование)
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
- **Поддержка MCP** — подключение внешних серверов инструментов (например,
  `@playwright/mcp`).
- **Планировщик** — `/loop`, `/cron` и `/jobs` повторяют задачи по таймеру.
- **Двуязычный интерфейс** — русский / английский (`/config lang`).

## Почему zames?

- **Нет API-ключа и счёта за токены** — используется ваш собственный аккаунт
  чата DeepSeek, а не платный API. Удобно для долгих задач с инструментами.
- **Тот же рабочий процесс, что в Claude Code / Codex** — инструменты,
  `AGENTS.md`, навыки, MCP и слэш-команды, так что всё знакомо с первого дня.
- **Работает без присмотра** — headless по умолчанию, возобновляемые сессии,
  `/loop` и `/cron` для задач по расписанию.
- **Local-first** — профиль браузера, учётные данные и логи не покидают вашу
  машину, а агент запесочен в директорию проекта.

## Требования

- Node.js >= 20
- Аккаунт DeepSeek. При первом запуске zames спросит логин/пароль DeepSeek в
  терминале (и сохранит их в `~/.zames/config.json` после успешного входа,
  поэтому более поздний разлогин обрабатывается автоматически, без повторных
  вопросов). Можно также войти вручную в окне браузера, когда он headed.

## Вход в аккаунт

Браузер по умолчанию работает **headless**. Когда DeepSeek требует входа,
zames:

1. переиспользует сессию из постоянного профиля (`~/.zames/profile`), если она
   ещё валидна;
2. иначе входит автоматически по сохранённым учётным данным
   (`browser.auth.username` / `browser.auth.password`);
3. иначе спрашивает логин/пароль в терминале (в TTY) и после успешного входа
   запоминает их для следующего раза;
4. иначе показывает подсказку про ручной вход.

Чтобы войти руками (например, если DeepSeek показывает капчу), запустите с
видимым окном:

```bash
zames --headed
```

Флаг `--headless` (значение по умолчанию) и `headless: true` в конфиге держат
браузер без окна; `--headed` / `headless: false` показывают его.

Headless работает из коробки: headless Chrome обычно представляется как
`HeadlessChrome/...`, и CDN DeepSeek блокирует такой User-Agent ответом 403,
поэтому zames срезает этот маркер перед загрузкой страницы (сохраняя реальную
версию движка). `--headed` нужен не только ради входа.

Учётные данные и переключатели можно также править из `/config`
(`browser.auth.username`, `browser.auth.password`, `browser.auth.saveSession`).

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
сайте DeepSeek.

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

Установите `NO_COLOR=1`, чтобы отключить цвета (иначе используется спокойная
палитра по умолчанию).

### Картинки и файлы

В строку ввода можно вставить картинку или файл (Ctrl+Shift+V / Shift+Insert
или собственной вставкой терминала). zames сохраняет его в `<project>/tmp` и
показывает маркер в строке — `[image#1]` для картинок, `[file#1]` для прочих
файлов — затем загружает реальный файл в чат вместе с вашим сообщением. Это те
же форматы, что принимает веб-чат DeepSeek (PNG, JPEG, GIF, WEBP, BMP, SVG и
обычные типы документов).

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
  длительность и размер контекста в токенах (DeepSeek
  `accumulated_token_usage`).
- /export [file] — записать транскрипт сессии в Markdown-файл
  (по умолчанию zames-export-<stamp>.md).
- /doctor — диагностика node, git, конфига, браузера, буфера обмена и MCP.
- /add-dir <path> — проверить дополнительную директорию (песочница
  фиксируется при старте; для записи туда перезапустите с --dir).
- /resume <n> (после /chats) и /resume-id <id> — открыть чат и НАПЕЧАТАТЬ его
  диалог в терминал, чтобы восстановленный контекст был виден. Показываются
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
- /compact — попросить DeepSeek сжать текущий чат в передаточное резюме, затем
  открыть НОВЫЙ чат, заново отправить системный промпт и положить резюме как
  перенесённый контекст. Используйте, когда контекст разрастается.
- /goal [text|clear] — задать долгоживущую цель сессии. Она добавляется в
  начало каждого сообщения задачи, поэтому модель держит общую картину через
  много ходов. Хранится в `<project>/.zames-goal` (git-ignored) и
  восстанавливается при следующем запуске.
- /loop <interval> <task> — повторять задачу периодически (например,
  `/loop 10m run the tests`). /cron "<min> <hour> <dom> <month> <dow>" <task> —
  запуск по расписанию. /jobs [rm <id>|clear] перечисляет и останавливает их.
  Сработавшая задача попадает в ту же очередь сообщений, что и ваш ввод, так
  что выполняется, когда агент свободен (никогда посреди генерации), и всё
  равно соблюдает троттлинг отправки.
- /thinking [on|off] и /web [on|off] — переключить Deep thinking / Smart search.
  Их (а также /queue, /jobs, /goal, `/config <sub>`) можно использовать, ПОКА
  агент работает — они не трогают текущую генерацию.
- /queue [clear] — показать или очистить сообщения, ждущие отправки после
  текущей задачи.

Контекст в токенах показывается и вживую: в строке статуса над вводом слева
спиннер/текст, справа — контекст (например, `125k · 13%`, процент от 1M
контекста). Он ОКРАШЕН по уровню заполнения: зелёный ниже 50%, жёлтый 50-80%,
красный выше 80%. Значение приходит из DeepSeek `accumulated_token_usage` и
скрыто до первого ответа.

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
использует для чата DeepSeek.

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

**Это официальный продукт DeepSeek?**
Нет. zames управляет публичным веб-интерфейсом chat.deepseek.com через
настоящий браузер, как обычный пользователь. Он не связан с DeepSeek.

**Нужен ли API-ключ?**
Нет. Вы один раз входите в свой аккаунт DeepSeek; сессия хранится в
`~/.zames/profile` и переиспользуется.

**Какую модель он использует?**
Ту, которую использует веб-чат DeepSeek (DeepSeek-V3 или reasoning-модель при
включённом «Deep thinking»). zames никогда не вызывает API напрямую.

**Работает ли headless / на сервере?**
Да — headless по умолчанию, а `--output-format jsonl` делает его скриптуемым.
`--headed` нужен только для ручного входа или отладки селекторов.

**Разрешена ли автоматизация веб-интерфейса?**
Это зависит от условий DeepSeek; автоматизация сайта может их нарушать.
Используйте на свой риск и держите троттлинг отправки (15 с по умолчанию),
чтобы не бить по рейт-лимиту.

**Чем отличается от Claude Code / Codex?**
Та же форма (инструменты, `AGENTS.md`, навыки, MCP, слэш-команды), но работает
на вашем аккаунте DeepSeek вместо API, как автоматизация браузера, а не
first-party API-клиент.

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
