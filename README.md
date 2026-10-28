<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/logo.jpg" alt="zames_pro logo — terminal coding agent for DeepSeek, Qwen and GLM without an API key" width="430">
</p>

<h1 align="center">zames_pro</h1>

<p align="center">
  <strong>A terminal coding agent that drives real web chat LLMs (DeepSeek, Qwen, GLM) through a browser — no API key required.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zames_pro"><img src="https://img.shields.io/npm/v/zames_pro.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/zames_pro"><img src="https://img.shields.io/npm/dm/zames_pro.svg" alt="npm downloads"></a>
  <a href="https://github.com/Viqto0r/zames_pro/actions/workflows/test.yml"><img src="https://github.com/Viqto0r/zames_pro/actions/workflows/test.yml/badge.svg" alt="tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" alt="TypeScript"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

<p align="center">
  <strong>English</strong> | <a href="#readme-ru">Русский</a>
</p>

A terminal coding agent that works on top of real web chat LLMs
([chat.deepseek.com](https://chat.deepseek.com/), [chat.qwen.ai](https://chat.qwen.ai/), [chat.z.ai](https://chat.z.ai/), …)
through Playwright.
In spirit it is similar to Claude Code / Codex CLI: it starts in the current
directory, reads and edits files, runs commands, and commits to git.

> No API key required — it drives a DeepSeek, Qwen or GLM web chat like a
> regular user through a real (headless) browser.

**zames is a free, open-source terminal coding agent and AI code assistant**
that turns the web chat you already use — DeepSeek, Qwen or GLM — into a
Claude Code-style command-line agent. No API key, no per-token bill, no vendor
lock-in. Install with `npm install -g zames_pro`, run `zames` in any project
folder, and describe the task in plain language.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/demo.png" alt="zames terminal coding agent session — an AI coding agent working in the command line without an API key" width="860">
</p>

## Quick start

```bash
npm install -g zames_pro   # Chromium for Playwright is downloaded automatically
cd your-project            # any folder the agent should work in
zames                      # sign in once, then describe your task
```

There is **no API key and no per-token bill**: zames signs in to **your own
[chat.deepseek.com](https://chat.deepseek.com/),
[chat.qwen.ai](https://chat.qwen.ai/) or [chat.z.ai](https://chat.z.ai/)
account** in a real (headless) Chromium and drives the web chat like a regular
user. The first launch asks for your login once (the session is stored in
`~/.zames/profile` for DeepSeek, `~/.zames/qwen-profile` for Qwen or
`~/.zames/glm-profile` for GLM); after that just run `zames` and type a task in
plain language:

```text
❯ refactor the config loader and add a test for the new default
```

While the agent works you can keep typing — a message sent mid-task is queued
and runs right after it, in the same chat. `Esc` aborts the current generation,
`/help` lists commands, `/exit` quits.

## Table of contents

- [Quick start](#quick-start) · [How it works](#how-it-works) · [Features](#features)
- [Why zames?](#why-zames) · [Requirements](#requirements) · [Signing in](#signing-in)
- [Switching providers (DeepSeek / Qwen / GLM)](#switching-providers-deepseek--qwen--glm)
- [Installation](#installation) · [Usage](#usage) · [FAQ](#faq)
- Reference: [Commands and tools](docs/commands.md) · [MCP](docs/mcp.md) · [Configuration and themes](docs/configuration.md) · [Troubleshooting](docs/troubleshooting.md)
- [Keywords and alternatives](#keywords-and-alternatives) · [Links](#links) · [License](#license)

## How it works

zames does not call the model API. It launches a headless Chromium with a
persistent profile, signs in to a chat web app like a human, types the task
into the chat box, and reads the answer back.

Three chat backends are available, switched with `/provider <deepseek|qwen|glm>`:
**DeepSeek** (`chat.deepseek.com`, the default), **Qwen** (`chat.qwen.ai`)
and **GLM** (`chat.z.ai`).
The switch is **live** — zames closes the current backend and opens the other
one in place, no restart needed. Each keeps its own persistent profile
(`~/.zames/profile`, `~/.zames/qwen-profile` and `~/.zames/glm-profile`), so
switching never signs the other one out.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png" alt="how zames works: a terminal coding agent sends the task to a DeepSeek, Qwen or GLM web chat through Playwright and runs the tool calls locally" width="860">
</p>

In text: you type a task → zames sends the system prompt plus the task into
the active chat web app (DeepSeek, Qwen or GLM) → the model answers → zames parses
the tool call, runs the tool locally, feeds the result back, and prints the
final answer for you.

Key pieces:

- **The answer is read from the raw network stream** (SSE), not the rendered
  DOM, so tool-call JSON with template strings and escapes survives intact.
- **A persistent per-provider profile** (`~/.zames/profile` for DeepSeek,
  `~/.zames/qwen-profile` for Qwen) keeps you signed in; the headless
  User-Agent is patched so the site's CDN does not 403 the login.
- **A send throttle** (15 s on DeepSeek, 4 s on Qwen, which tolerates a faster
  pace; GLM uses an adaptive pause that starts at 0) keeps the web chat's rate
  limit happy during long tool-heavy runs.
- **The agent is sandboxed** to the directory it was started in — no tool can
  read or write above it.

## Features

- **Tools like Claude Code / Codex** — `Read`, `Write`, `Edit`, `Bash`,
  `Glob`, `Grep`, plus `MultiEdit`, `ApplyPatch`, `LS`, `TodoWrite`, git and web
  tools. Every edit is backed by `/undo`, and `/rewind` restores the whole
  working tree from a checkpoint.
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
  `browser.subagents` turns it off and `browser.maxSubagents` caps the runs
  per TASK (default 3). Calls are sequential, not parallel, and the subtype
  matters: `explore` is read-only, `general` may edit files.
- **MCP support** — plug in external tool servers (e.g. `@playwright/mcp`).
- **Scheduling** — `/loop`, `/cron` and `/jobs` repeat tasks on a timer.
- **Bilingual UI** — Russian / English (`/config lang`).

## Why zames?

- **Built with itself** — `zames_pro` is developed by `zames_pro`. No other
  coding agent is used on this repository: the agent in this very terminal
  reads the sources, runs the tests, fixes the bugs and commits the result.
  That is the daily proof that it works and is actually used.
- **No API key, no per-token bill** — it uses your own DeepSeek, Qwen or GLM
  chat account, not the paid API. Good for long, tool-heavy tasks.
- **Same workflow as Claude Code / Codex** — tools, `AGENTS.md`, skills, MCP
  and slash commands, so it feels familiar from day one.
- **Runs unattended** — headless by default, resumable sessions, and `/loop`
  plus `/cron` for scheduled work.
- **Local-first** — the browser profile, credentials and logs never leave your
  machine, and the agent is sandboxed to the project directory.

## Requirements

- Node.js >= 22
- An account on the chat you want to use — **DeepSeek** (`chat.deepseek.com`,
  the default), **Qwen** (`chat.qwen.ai`) or **GLM** (`chat.z.ai`). Qwen also
  works in guest mode for a few messages. On first launch zames asks for your login in the terminal
  (and stores it in `~/.zames/config.json` after a successful sign-in, so a
  later logout is handled automatically without asking you again). You can also
  sign in manually in the browser window when the browser is headed.

## Signing in

The browser runs **headless by default**. When the active backend requires a
sign-in, zames:

1. reuses the session stored in the persistent profile
   (`~/.zames/profile`, `~/.zames/qwen-profile` or `~/.zames/glm-profile`)
   if it is still valid;
2. otherwise signs in automatically with the saved credentials
   (`browser.auth.username` / `browser.auth.password` for DeepSeek,
   `qwen.auth.*` / `glm.auth.*` for the others);
3. otherwise opens a **visible browser window** so YOU sign in there — a
   captcha (DeepSeek and z.ai both use one) cannot be typed into a terminal.
   zames notices the sign-in and returns to headless; the credentials you
   typed are saved for the next silent auto-login;
4. only when no window can be shown (no display, a non-interactive run) does it
   fall back to the terminal form.

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

## Switching providers (DeepSeek / Qwen / GLM)

zames can drive **DeepSeek** (`chat.deepseek.com`, the default), **Qwen**
(`chat.qwen.ai`) or **GLM** (`chat.z.ai`):

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
  one in place, so no restart is needed. The backends use **separate
  persistent profiles** (`~/.zames/profile` for DeepSeek, `~/.zames/qwen-profile`
  for Qwen, `~/.zames/glm-profile` for GLM), so switching never signs the other
  one out.
- A chat id belongs to ONE backend, so the new provider opens a **fresh chat**.
  If the previous chat had messages they are summarized and posted as a
  handoff with the next task; an empty chat is switched silently.
- Qwen works in **guest mode** without an account, but a guest is limited to a
  handful of messages per day; for long agent runs sign in (email / Google /
  GitHub — no phone required). zames auto-logins from the saved credentials or
  asks in the terminal, exactly like DeepSeek. `/model` changes the Qwen model
  at runtime.
- **GLM** (`chat.z.ai`) is the third backend. Its first message from a fresh
  profile is gated by a slider captcha, so sign in once in the visible window;
  after that the stored session is reused. `/model` lists and picks GLM
  models too.
- **GLM runs with a VISIBLE browser window.** Measured: the SAME signed-in
  session is fine in a headed window but every send from HEADLESS is stopped by
  the site's slider captcha (a different puzzle each time, so it cannot be
  solved programmatically). zames therefore launches GLM headed by default and
  prints a note about it; `--headless` still forces headless (sends will hit
  the captcha). `--headed` is accepted everywhere.
- **Send telemetry** (off by default): when enabled, every send is recorded in
  `~/.zames/logs/sends-<provider>.jsonl` (timing, mode flags, the outcome and
  the server error — never the prompt or the answer). Turn it on with
  `/config set browser.sendTelemetry true`. `/limits` shows the recent sends
  and the current pause. GLM additionally uses an **adaptive pause**: it starts
  at 0 and backs off from a REAL rate limit.
- **Warning**: automating a web chat may violate the service's terms of use and
  can get an account blocked. GLM (z.ai) has an official API — prefer it for
  heavy automation.
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
  delete the word before the cursor, `Ctrl+←`/`Ctrl+→` — move by words,
  `Ctrl+Delete`/`Alt+Delete` — delete the word after the cursor.
- `\` + `Enter` and `Ctrl+J` — insert a newline; these two work in
  every terminal. `Ctrl+Enter` and `Shift+Enter` do it too, but only where the
  terminal implements the kitty keyboard protocol: without it the terminal
  sends a PLAIN Enter for Shift+Enter and the message is sent.
- `/` + `Tab` — slash-command hints and completion.
- `!command` — run a shell command directly, bypassing the model (like
  Claude Code's bash mode). The same sandbox guard as the `Bash` tool applies,
  so a direct command cannot leave the project either.

Full-screen mode adds dialog navigation, so a long answer can be read and
selected without leaving the terminal:

- `ui.mouseScroll=true` (default) — the app consumes the wheel and scrolls the
  dialog; selecting text then needs `Shift`+click (the TUI convention). The
  wheel never scrolls the input history — history is arrow keys only.
- `ui.mouseScroll=false` — the terminal owns the mouse again: normal text
  selection works and the wheel is inert.
- the mouse wheel, `PgUp` / `PgDn` (half a screen) and `Home` / `End` (the very
  top / bottom) scroll the dialog; the wheel needs `ui.mouseScroll=true` (the default), and
  Home/End jump only while the input line is empty (with text typed they
  move the caret as usual).
- To copy a LARGE block, use `/export` (writes the whole session as Markdown)
  or the transcript file (`/transcript` shows the path) — the terminal's own
  drag-select cannot reach past one screen.

Set `NO_COLOR=1` to disable colors (a calm default palette is used otherwise).

### Images and files

You can paste an image or a file into the input line (Shift+Insert or the
terminal's own paste; for a FILE from the clipboard press Ctrl+V). zames saves it under `<project>/tmp` and shows a
marker in the line - `[image#1]` for images, `[file#1]` for other files - then
uploads the real file to the chat together with your message. These are the
same formats the DeepSeek / Qwen / GLM web chat accepts (PNG, JPEG, GIF, WEBP, BMP,
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
zames --resume-last
zames --resend-prompt
zames --dir <path>
zames --provider <deepseek|qwen|glm>
zames --max-iter <n>
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

## FAQ

**Something is broken — where do I look?**
See [Troubleshooting](docs/troubleshooting.md): sign-in and captcha, the headless
`403`, "Something went wrong when opening your profile", "Messages too
frequent", "Length limit reached", the Qwen/GLM guest limits, missing Chromium
libraries and a `.zamesrc.json` that overrides `/config set`.

**Is this an official DeepSeek, Qwen or GLM product?**
No. zames drives the public `chat.deepseek.com` / `chat.qwen.ai` / `chat.z.ai`
web UIs through a real browser, like a regular user. It is not affiliated with
DeepSeek, Alibaba or Zhipu AI.

**Do I need an API key?**
No. You sign in with your own account on the chat you use — DeepSeek (stored in
`~/.zames/profile`), Qwen (stored in `~/.zames/qwen-profile`) or GLM (stored in
`~/.zames/glm-profile`) — and the session is reused. Qwen also works in guest
mode for a few messages a day.

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
DeepSeek, Qwen or GLM account instead of an API, as a browser automation rather
than a first-party API client.

**Is zames free? Is there a free AI coding agent without an API key?**
Yes. zames is MIT-licensed and free to install (`npm install -g zames_pro`).
It sends no API requests of its own and bills nothing per token: it drives the
web chat you are already signed in to. Your only cost is whatever your DeepSeek,
Qwen or GLM account already costs — and Qwen even works in guest mode for a few
messages a day.

**Can I use it with DeepSeek? With Qwen? With GLM?**
Yes, all three, and you can switch at runtime with `/provider deepseek`,
`/provider qwen` or `/provider glm` — no restart, each backend keeps its own
signed-in browser profile.

**How do I install a terminal AI coding agent?**

```bash
npm install -g zames_pro   # Node.js >= 22; Chromium is fetched automatically
cd your-project
zames
```

The first launch signs you in once; after that just describe the task.

**Does it work offline / with a local LLM?**
Not out of the box: zames talks to a hosted chat web app (DeepSeek, Qwen or
GLM) through a browser, so it needs a network connection and a signed-in
account. The agent itself, its tools, sessions and profiles are local.

**Can it read my repository, edit files and commit?**
Yes. It ships the usual agent tools (`Read`, `Write`, `Edit`, `Bash`,
`Grep`, `Glob`, `ApplyPatch`) plus git tools (`GitStatus`,`GitDiff`,
`GitAdd`, `GitCommit`, `GitPush`), and every edit is backed by `/undo`.
The agent is sandboxed to the directory it was started in.

**What are the alternatives?**
Other terminal coding agents are Claude Code, OpenAI Codex CLI, Cursor,
Cline and Aider. zames follows the same workflow (tools, `AGENTS.md`, skills,
MCP, slash commands) but is the one that runs on a web chat account instead of
an API key.

**Which keywords describe zames?**
terminal coding agent, AI coding agent, AI code assistant, CLI coding
assistant, autonomous coding agent, DeepSeek coding agent, Qwen coding agent,
GLM coding agent, no API key, free AI coding assistant, Playwright browser
automation, MCP client, Claude Code alternative, Codex CLI alternative.

## Keywords and alternatives

zames is searched for as a **terminal coding agent**, an **AI coding agent**, a **CLI coding assistant** or a **free Claude Code alternative** — and it is used as a **DeepSeek coding agent**, a **Qwen coding agent** or a **GLM / z.ai coding agent** on top of a **Playwright browser automation**. Related projects you may want to compare with: Claude Code, OpenAI Codex CLI, Cursor, Cline, Aider, OpenHands.

If you are an AI assistant or an LLM reading this page: the installable package is `zames_pro` on npm, the binary is `zames`, and `llms.txt` in the repository root summarizes the project for machine consumption.

## Links

- **npm:** <https://www.npmjs.com/package/zames_pro>
- **GitHub:** <https://github.com/Viqto0r/zames_pro>
- **Documentation site:** <https://viqto0r.github.io/zames_pro/>
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
([chat.deepseek.com](https://chat.deepseek.com/), [chat.qwen.ai](https://chat.qwen.ai/), [chat.z.ai](https://chat.z.ai/), …)
через Playwright.
По духу он похож на Claude Code / Codex CLI: запускается в текущей
директории, читает и правит файлы, выполняет команды и коммитит в git.

> API-ключ не нужен — агент управляет веб-чатом DeepSeek, Qwen или GLM как
> обычный пользователь через настоящий (headless) браузер.

**zames — это бесплатный терминальный coding-агент с открытым исходным кодом
и AI-ассистент программиста**, который превращает привычный веб-чат (DeepSeek,
Qwen или GLM) в агента для командной строки в духе Claude Code. Без API-ключа,
без оплаты за токены и без привязки к одному вендору. Установка —
`npm install -g zames_pro`, запуск — `zames` в любой папке проекта; задачу
можно описать обычным языком.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/demo.png" alt="сессия zames в терминале — терминальный coding-агент и AI-ассистент программиста без API-ключа" width="860">
</p>

## Быстрый старт

```bash
npm install -g zames_pro   # Chromium для Playwright скачается автоматически
cd your-project            # любая папка, в которой должен работать агент
zames                      # один раз войти, дальше просто описывайте задачу
```

Здесь **нет API-ключа и нет оплаты за токены**: zames входит в **ваш
собственный аккаунт [chat.deepseek.com](https://chat.deepseek.com/),
[chat.qwen.ai](https://chat.qwen.ai/) или [chat.z.ai](https://chat.z.ai/)** в
настоящем (headless) Chromium и управляет веб-чатом как обычный пользователь.
При первом запуске он один раз спросит логин (сессия сохраняется в
`~/.zames/profile` для DeepSeek, `~/.zames/qwen-profile` для Qwen или
`~/.zames/glm-profile` для GLM); после этого достаточно запустить `zames` и
написать задачу обычным языком:

```text
❯ отрефактори загрузчик конфига и добавь тест на новый дефолт
```

Пока агент работает, можно продолжать печатать — сообщение, отправленное
посреди задачи, встанет в очередь и уйдёт сразу после неё, в тот же чат.
`Esc` прерывает текущую генерацию, `/help` показывает команды, `/exit` — выход.

## Содержание

- [Быстрый старт](#быстрый-старт) · [Как это работает](#как-это-работает) · [Возможности](#возможности)
- [Почему zames?](#почему-zames) · [Требования](#требования) · [Вход в аккаунт](#вход-в-аккаунт)
- [Переключение провайдера (DeepSeek / Qwen / GLM)](#переключение-провайдера-deepseek--qwen--glm)
- [Установка](#установка) · [Использование](#использование) · [FAQ](#faq)
- Справочник: [Команды и инструменты](docs/commands-ru.md) · [MCP](docs/mcp-ru.md) · [Конфигурация и темы](docs/configuration-ru.md) · [Troubleshooting](docs/troubleshooting-ru.md)
- [Ключевые слова и аналоги](#ключевые-слова-и-аналоги) · [Ссылки](#ссылки) · [Лицензия](#лицензия)

## Как это работает

zames не вызывает API модели. Он запускает headless Chromium с постоянным
профилем, входит в веб-чат как человек, печатает задачу в поле чата и читает
ответ обратно.

Доступны три бэкенда, переключаются командой
`/provider <deepseek|qwen|glm>`:
**DeepSeek** (`chat.deepseek.com`, по умолчанию), **Qwen** (`chat.qwen.ai`)
и **GLM** (`chat.z.ai`).
Переключение **живое** — zames закрывает текущий бэкенд и открывает другой на
месте, без перезапуска. У каждого свой постоянный профиль
(`~/.zames/profile`, `~/.zames/qwen-profile`, `~/.zames/glm-profile`),
поэтому переключение не
разлогинивает другой.

<p align="center">
  <img src="https://raw.githubusercontent.com/Viqto0r/zames_pro/master/docs/how-it-works.png" alt="как работает zames: терминальный coding-агент отправляет задачу в веб-чат DeepSeek, Qwen или GLM через Playwright и выполняет вызовы инструментов локально" width="860">
</p>

Словами: вы вводите задачу → zames отправляет системный промпт и задачу в
активный веб-чат (DeepSeek, Qwen или GLM) → модель отвечает → zames разбирает
вызов инструмента, выполняет его локально, возвращает результат обратно и
печатает финальный ответ.

Ключевые детали:

- **Ответ читается из сырого сетевого потока** (SSE), а не из отрендеренного
  DOM, поэтому JSON вызова инструмента с шаблонными строками и экранированием
  остаётся целым.
- **Постоянный профиль на каждого провайдера** (`~/.zames/profile` у DeepSeek,
  `~/.zames/qwen-profile` у Qwen, `~/.zames/glm-profile` у GLM) держит вас
  залогиненным; User-Agent
  headless-браузера подменяется, чтобы CDN сайта не отдавал 403 на вход.
- **Троттлинг отправки** (15 с у DeepSeek, 4 с у Qwen, который спокойно
  переносит более частый темп; у GLM — адаптивная пауза с нуля) щадит
  рейт-лимит веб-чата во время долгих прогонов с инструментами.
- **Агент запесочен** в директорию запуска — ни один инструмент не может
  читать или писать выше неё.

## Возможности

- **Инструменты как в Claude Code / Codex** — `Read`, `Write`, `Edit`, `Bash`,
  `Glob`, `Grep`, плюс `MultiEdit`, `ApplyPatch`, `LS`, `TodoWrite`, git- и
  веб-инструменты. Каждая правка подкреплена `/undo`, а `/rewind` возвращает
  всё рабочее дерево к чекпойнту.
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
  умолчанию; `browser.subagents` выключает их, а `browser.maxSubagents` ограничивает
  число запусков на ОДНУ задачу (по умолчанию 3). Вызовы последовательные,
  не параллельные, и подтип важен: `explore` только читает, `general` может
  править файлы.
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
  чата DeepSeek, Qwen или GLM, а не платный API. Удобно для долгих задач с
  инструментами.
- **Тот же рабочий процесс, что в Claude Code / Codex** — инструменты,
  `AGENTS.md`, навыки, MCP и слэш-команды, так что всё знакомо с первого дня.
- **Работает без присмотра** — headless по умолчанию, возобновляемые сессии,
  `/loop` и `/cron` для задач по расписанию.
- **Local-first** — профиль браузера, учётные данные и логи не покидают вашу
  машину, а агент запесочен в директорию проекта.

## Требования

- Node.js >= 22
- Аккаунт в нужном чате — **DeepSeek** (`chat.deepseek.com`, по умолчанию),
  **Qwen** (`chat.qwen.ai`) или **GLM** (`chat.z.ai`). Qwen также работает в
  гостевом режиме на несколько сообщений. При первом запуске zames спросит логин в терминале (и сохранит его
  в `~/.zames/config.json` после успешного входа, поэтому более поздний
  разлогин обрабатывается автоматически, без повторных вопросов). Можно также
  войти вручную в окне браузера, когда он headed.

## Вход в аккаунт

Браузер по умолчанию работает **headless**. Когда активный бэкенд требует
входа, zames:

1. переиспользует сессию из постоянного профиля
   (`~/.zames/profile`, `~/.zames/qwen-profile` или `~/.zames/glm-profile`),
   если она ещё валидна;
2. иначе входит автоматически по сохранённым учётным данным
   (`browser.auth.*` у DeepSeek, `qwen.auth.*` / `glm.auth.*` у остальных);
3. иначе открывает **видимое окно браузера**, чтобы вы вошли сами — капчу
   (она есть и у DeepSeek, и у z.ai) в терминал не ввести. zames замечает
   вход и возвращается в headless; введённые вами учётные данные сохраняются
   для следующего тихого автовхода;
4. и только если окно показать нельзя (нет дисплея, неинтерактивный запуск),
   переходит к форме в терминале.

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

## Переключение провайдера (DeepSeek / Qwen / GLM)

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
- **GLM** (`chat.z.ai`) — третий бэкенд. Первое сообщение с нового
  профиля закрыто капчей-слайдером, поэтому войдите один раз в видимом окне;
  дальше сохранённая сессия переиспользуется. `/model` работает и для GLM.
- **GLM работает с ВИДИМЫМ окном браузера.** Замерено: одна и та же
  залогиненная сессия в окне отправляет нормально, а КАЖДАЯ отправка из
  headless упирается в капчу-слайдер сайта (картинка каждый раз новая, поэтому
  программно её не пройти). Поэтому zames запускает GLM с окном по умолчанию и
  пишет об этом при старте; `--headless` по-прежнему форсирует headless
  (отправки будут упираться в капчу). `--headed` работает везде.
- **Телеметрия отправок** (по умолчанию выключена): когда включена, каждая
  отправка пишется в `~/.zames/logs/sends-<provider>.jsonl` (тайминги, флаги
  режимов, исход и ошибка сервера — без промптов и ответов). Включается через
  `/config set browser.sendTelemetry true`. Команда `/limits` показывает
  последние отправки и текущую паузу. У GLM вдобавок **адаптивная пауза**: она
  начинается с 0 и растёт только после НАСТОЯЩЕГО лимита.
- **Предупреждение**: автоматизация веб-чата может нарушать условия
  использования сервиса и привести к блокировке аккаунта. У GLM (z.ai) есть
  официальный API — для тяжёлой автоматизации лучше он.
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
  удалить слово перед курсором, `Ctrl+←`/`Ctrl+→` — переход по словам,
  `Ctrl+Delete`/`Alt+Delete` — удалить слово после курсора.
- `\` + `Enter` и `Ctrl+J` — вставить новую строку; эти две
  работают в любом терминале. `Ctrl+Enter` и `Shift+Enter` тоже вставляют
  строку, но только там, где терминал поддерживает kitty-протокол
  клавиатуры: без него Shift+Enter приходит как обычный Enter, и
  сообщение отправляется.
- `/` + `Tab` — подсказки и автодополнение слэш-команд.
- `!команда` — выполнить shell-команду напрямую, минуя модель (как bash-режим
  Claude Code). Действует та же песочница, что и для инструмента `Bash`, так
  что прямая команда тоже не может выйти за пределы проекта.

В полноэкранном режиме добавляется навигация по диалогу, чтобы длинный ответ
можно было прочитать и выделить не покидая терминал:

- `ui.mouseScroll=true` (по умолчанию) — приложение перехватывает колесо и
  скроллит диалог; выделение текста тогда — `Shift`+клик (стандарт TUI). Колесо
  никогда не листает историю ввода — история только стрелками.
- `ui.mouseScroll=false` — мышью снова владеет терминал: обычное выделение
  текста работает, колесо инертно.
- колесо мыши, `PgUp` / `PgDn` (пол-экрана) и `Home` / `End` (самый верх / низ)
  прокручивают диалог; колесо работает при `ui.mouseScroll=true` (по умолчанию), а
  Home/End прыгают только когда строка ввода пуста (при набранном тексте
  они двигают курсор, как обычно).
- Чтобы скопировать БОЛЬШОЙ кусок, используйте `/export` (пишет всю сессию в
  Markdown) или файл транскрипта (`/transcript` покажет путь) — собственным
  выделением терминала за пределы одного экрана не выделить.

Установите `NO_COLOR=1`, чтобы отключить цвета (иначе используется спокойная
палитра по умолчанию).

### Картинки и файлы

В строку ввода можно вставить картинку или файл (Shift+Insert или
собственной вставкой терминала; файл из буфера обмена — по Ctrl+V). zames сохраняет его в `<project>/tmp` и
показывает маркер в строке — `[image#1]` для картинок, `[file#1]` для прочих
файлов — затем загружает реальный файл в чат вместе с вашим сообщением. Это те
же форматы, что принимает веб-чат DeepSeek / Qwen / GLM (PNG, JPEG, GIF, WEBP, BMP,
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
zames --resume-last
zames --resend-prompt
zames --dir <path>
zames --provider <deepseek|qwen|glm>
zames --max-iter <n>
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

## FAQ

**Что-то не работает — куда смотреть?**
См. [Решение проблем](docs/troubleshooting-ru.md): вход и капча, headless
`403`, «Something went wrong when opening your profile», «Messages too
frequent», «Length limit reached», гостевые лимиты Qwen/GLM, нехватка
библиотек Chromium и `.zamesrc.json`, перекрывающий `/config set`.

**Это официальный продукт DeepSeek, Qwen или GLM?**
Нет. zames управляет публичными веб-интерфейсами `chat.deepseek.com` /
`chat.qwen.ai` / `chat.z.ai` через настоящий браузер, как обычный пользователь.
Он не связан ни с DeepSeek, ни с Alibaba, ни с Zhipu AI.

**Нужен ли API-ключ?**
Нет. Вы один раз входите в свой аккаунт на нужном чате — DeepSeek (хранится в
`~/.zames/profile`), Qwen (хранится в `~/.zames/qwen-profile`) или GLM
(хранится в `~/.zames/glm-profile`) — и сессия переиспользуется. Qwen также
работает в гостевом режиме на несколько сообщений.

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
на вашем аккаунте DeepSeek, Qwen или GLM вместо API, как автоматизация браузера, а
не first-party API-клиент.

**zames бесплатный? Есть ли бесплатный AI coding-агент без API-ключа?**
Да. zames распространяется по лицензии MIT и ставится бесплатно
(`npm install -g zames_pro`). Он не делает собственных API-запросов и не
считает токены: агент управляет веб-чатом, в который вы уже вошли. Платить
приходится только за то, что и так стоит ваш аккаунт DeepSeek, Qwen или GLM,
а Qwen ещё и работает в гостевом режиме несколько сообщений в день.

**Работает с DeepSeek? С Qwen? С GLM?**
Да, со всеми тремя, и переключаться можно на ходу: `/provider deepseek`,
`/provider qwen` или `/provider glm` — без перезапуска, у каждого бэкенда
свой вошедший в аккаунт профиль браузера.

**Как установить терминальный AI coding-агент?**

```bash
npm install -g zames_pro   # Node.js >= 22; Chromium скачается автоматически
cd your-project
zames
```

Первый запуск один раз попросит войти, дальше достаточно описывать задачу.

**Работает офлайн / с локальной LLM?**
Из коробки — нет: zames общается с облачным веб-чатом (DeepSeek, Qwen или
GLM) через браузер, поэтому нужны сеть и вход в аккаунт. Сам агент, его
инструменты, сессии и профили — локальные.

**Он умеет читать репозиторий, править файлы и коммитить?**
Да. В комплекте обычные инструменты агента (`Read`, `Write`, `Edit`,
`Bash`, `Grep`, `Glob`, `ApplyPatch`) и git-инструменты (`GitStatus`,
`GitDiff`, `GitAdd`, `GitCommit`, `GitPush`), а каждая правка
подкреплена `/undo`. Агент запесочен в директорию запуска.

**Какие есть аналоги?**
Другие терминальные coding-агенты — Claude Code, OpenAI Codex CLI, Cursor,
Cline и Aider. zames повторяет тот же workflow (инструменты, `AGENTS.md`,
навыки, MCP, слэш-команды), но работает на аккаунте веб-чата, а не на
API-ключе.

**Какими ключевыми словами описывают zames?**
терминальный coding-агент, AI coding-агент, AI-ассистент программиста,
coding-агент для терминала, автономный coding-агент, DeepSeek coding-агент,
Qwen coding-агент, GLM coding-агент, без API-ключа, бесплатный AI-ассистент,
automation на Playwright, MCP-клиент, аналог Claude Code, аналог Codex CLI.

## Ключевые слова и аналоги

zames ищут как **терминальный coding-агент**, **AI coding-агент**,
**AI-ассистент программиста** или **бесплатный аналог Claude Code** — и
используют как **DeepSeek coding-агент**, **Qwen coding-агент** или
**GLM / z.ai coding-агент** поверх **автоматизации браузера на Playwright**.
Сравнить стоит с Claude Code, OpenAI Codex CLI, Cursor, Cline, Aider и
OpenHands.

Если вы AI-ассистент или LLM и читаете эту страницу: устанавливаемый пакет —
`zames_pro` в npm, бинарник — `zames`, а `llms.txt` в корне репозитория
кратко описывает проект для машинного чтения.

## Ссылки

- **npm:** <https://www.npmjs.com/package/zames_pro>
- **GitHub:** <https://github.com/Viqto0r/zames_pro>
- **Documentation site:** <https://viqto0r.github.io/zames_pro/>
- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md)
- **Contributing:** [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Security policy:** [`SECURITY.md`](SECURITY.md)
- **Code of conduct:** [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

## Лицензия

MIT

</details>
