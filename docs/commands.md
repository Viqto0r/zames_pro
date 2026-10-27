# Commands and tools

The full tool list and every slash command of zames_pro. The README is a short overview.

## Tools

The agent has the same style of tools as Claude Code / Codex CLI:

- **File tools** — `Read`, `Write`, `Edit`, `Bash`, `BashOutput`, `Glob`,
  `Grep`. `Read` returns raw content by default; pass `numbered=true` to get
  `cat -n`-style line numbers (for reference only — do not paste them into
  `Edit`). `Bash` takes `run_in_background`; `BashOutput` then polls or kills
  that process.
- **Extra tools** — `LS` (list a directory), `MultiEdit` (several edits to one
  file applied atomically), `TodoWrite` (session task checklist), `ApplyPatch`
  (multi-file patch in Codex's V4A format: `*** Begin Patch` … `*** End Patch`).
- **Git** — `GitStatus`, `GitDiff`, `GitLog`, `GitShow`, `GitBranchList`,
  `GitAdd`, `GitCommit`, `GitPush`.
- **Web** — `WebFetch`, `WebSearch`.
- **Subagents** — `Task` (delegate a self-contained sub-task to an agent in
  its own chat; `explore` is read-only, `general` may edit; capped per task).
- **Operator** — `AskUser` (a modal question with options; skipped in plan
  mode so a plan is never interrupted).
- **Service** — `respond` (final answer to the operator, ends the task).

All file tools stay inside the working directory (sandbox). `Write`/`Edit` and
`MultiEdit`/`ApplyPatch` make a backup (undo) before touching a file.

## Slash commands

Type / in the prompt for hints (Tab completes) — that list is always complete,
`/help <command>` describes any single one. Besides the session and config
commands (/new or /clear, /sessions, /chats, /resume-id, /last, /chat, /cd,
/pwd, /status, /config, /undo, /undo-list, /rewind, /rewind-list, /transcript,
/tasks, /mcp, /skills, /memory, /remember, /init, /reload, /debug-dom, /help,
/exit) there are a few that mirror Claude Code / Codex CLI:

- /diff [--staged] — show the working-tree git diff (--staged for the index).
- /diffstat — a one-line change summary (`git diff --stat`).
- /context — show what is loaded into the prompt (AGENTS.md, MEMORY.md,
  skills, custom commands) and the system-prompt size.
- /retry — resend the last task into the same chat (handy after a truncated
  or empty answer).
- /rename <title> — set the current session title (shown in /sessions).
- /copy — copy the last assistant answer to the OS clipboard.
- /cost (alias /usage) — session stats: tasks, tool calls, duration, and the
  context size in tokens (DeepSeek's `accumulated_token_usage`, Qwen's
  `input_tokens`, GLM's `prompt_tokens`).
- /export [file] — write the session transcript to a Markdown file
  (zames-export-<stamp>.md by default).
- /doctor — diagnose node, git, config, browser, clipboard, MCP and the
  active chat provider (it also reports that provider's UI health).
- /provider <deepseek|qwen|glm> — switch the chat backend (applied live, no
  restart); /provider status shows the active provider/model/login; /provider
  login re-runs the sign-in check. /model [id] lists or picks a Qwen/GLM model at
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
  (Write/Edit/MultiEdit/ApplyPatch/Bash/BashOutput, GitAdd/GitCommit/GitPush,
  AskUser) are removed from the tool set, and so are MCP tools with a mutating
  name, so the agent can investigate without touching the tree.
  Start in it with `--plan`.
- /compact — ask the active backend to compress the current chat into a handover
  summary, then open a NEW chat, resend the system prompt and post the summary
  as the carried-over context. Use it when the context gets long.
- /goal <condition> — set a **completion condition** (Claude Code parity). The
  agent starts working toward it at once and keeps starting new turns until a
  separate evaluator model judges the condition met. The goal clears itself
  automatically when it is met (or judged impossible), or with `/goal clear`
  (or its synonym `/goal off`). The condition is stored in `<project>/.zames-goal`
  (git-ignored) and restored on the next launch. `/goal` with no argument — or
  `/goal on` — shows the current state.
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
- /queue [list|ls|clear|c|clean] — list (`list`/`ls`) or clear
  (`clear`/`c`/`clean`) the messages waiting to be sent after the current
  task.

The token context is also shown live: the status line above the input has the
spinner/text on the left and the context on the right (e.g. `125k · 13%`). The
percentage is of the ACTIVE provider's window — 1M for DeepSeek, a per-model
value for Qwen and GLM (`qwen.contextLimit` / `glm.contextLimit`) — and it is
COLORED by fill level: green below 50%, yellow 50-80%, red above 80%.
It comes from the provider's own token counter (DeepSeek's
`accumulated_token_usage`, Qwen's `input_tokens`, GLM's `prompt_tokens`) and is
hidden until the first answer delivers it.

## Project context, skills and memory

Like Codex / Claude Code, zames reads project instructions and reusable
workflows from your repository and from `~/.zames`.

- **AGENTS.md** — project instructions, in the repo root (or any parent folder
  of the working directory); the agent writes it with `/init`. Global
  instructions live in
  `~/.zames/AGENTS.md` (and `~/.claude/CLAUDE.md`). Run `/init` and the agent
  will explore the project and write an AGENTS.md based on the real build/test
  commands and conventions (use `/init --force` to overwrite an existing file).
- **MEMORY.md** — durable notes that persist between sessions. The agent
  appends useful facts here as it works; `/remember <text>` adds one from the
  prompt, and any `/task`-style edit through the agent keeps the file in sync.
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
