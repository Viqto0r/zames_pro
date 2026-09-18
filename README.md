# zames_pro

![zames logo](https://raw.githubusercontent.com/Viqto0r/zames_pro/master/logo.png)

A terminal coding agent that works on top of [chat.deepseek.com](https://chat.deepseek.com/) through Playwright.
In spirit it is similar to Claude Code / Codex CLI: it starts in the current
directory, reads and edits files, runs commands, and commits to git.

## Requirements

- Node.js >= 18
- Google Chrome or Chromium (used through Playwright)
- A DeepSeek account (you log in manually in the browser window that opens on first launch)

## Installation

```bash
npm install -g zames_pro
npx playwright install chromium
```

## Usage

Go to your project folder and run:

```bash
zames
```

The agent works inside the directory it was started in and cannot leave it (sandbox).

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

## Configuration

Global config: `~/.zames/config.json`
Local (per project): `.zamesrc.json`

Agent data is stored in `~/.zames`: browser profile, logs, undo history, self-review snapshots.

## License

MIT
