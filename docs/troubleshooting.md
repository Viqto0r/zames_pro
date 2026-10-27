# Troubleshooting

Typical problems and what to do. Every fix below is a real command or setting
that exists in zames.

## The first sign-in fails / the browser shows a captcha

Symptom: `zames` asks for a login, the browser window opens (with `--headed`)
and the site shows a slider captcha; or a headless cold login just fails.

This is anti-bot protection on a fresh session, and a captcha cannot be typed
into a terminal. Run `zames --headed` once and sign in by hand in the
window; the session is stored in the provider's profile (`~/.zames/profile`,
`~/.zames/qwen-profile`, `~/.zames/glm-profile`) and reused. Saved
credentials are tried first - remove them with
`/config set browser.auth.password ""`. For GLM a headed run is the
practical mode: the Aliyun slider also gates the first SEND.

## The login works in a visible window but not headless

Symptom: `zames --headed` signs in fine, plain `zames` lands on a plain
`403 ERROR` page.

A headless Chromium advertises `HeadlessChrome/<v>` in its User-Agent
and the site's CDN rejects that UA before the app loads. zames strips the
marker automatically (`sanitizeHeadlessUA`). If you set a custom User-Agent
yourself, remove the `Headless` word: an explicit UA wins and is never patched.
The `/doctor` command reports the browser row.

## "Something went wrong when opening your profile"

Symptom: the browser shows this page instead of the chat.

Two Chromium processes were pointed at the SAME `--user-data-dir`. The
classic case is `@playwright/mcp` launched without `--isolated`: it
defaults to `~/.zames/profile`, the same profile the agent uses. Close the
second browser, and in your MCP config always pass `--isolated`) (or an
explicit separate `--user-data-dir`). See [MCP](docs/mcp.md). Never delete
`~/.zames/profile` while a browser may be running.

## "Messages too frequent" / rate limit

Symptom: the chat shows "Messages too frequent. Try again later." and the
agent waits, retries, or stops with a rate-limit message.

The web chat limits how often one account may send. Raise the pause between
sends with `/config set browser.minSendIntervalMs 20000` (DeepSeek default
15000; Qwen uses `qwen.minSendIntervalMs`, 4000). Inspect the history with
`/limits` (timing, outcome and the server error per send, never the
prompt) and `/cost`. Waiting it out is often the only real fix - the limit
is per account.

## "Length limit reached. Please start a new chat."

Symptom: the chat refuses EVERY further message with that notice.

The chat's context window is exhausted, and retrying in the same chat
can never succeed. zames handles this itself - it compacts and opens a
fresh chat, or tells you to. Manually, use `/compact` (it may finish
the summary from the local history if the old chat refuses the summary
prompt too) or `/new` and repeat the task. Check the fill level on the
status line or with `/cost`; the auto-compact threshold is `browser.autoCompactPct`.

## The guest limits of Qwen / GLM

Symptom: Qwen answers `RateLimited` after a few turns; GLM shows a captcha
on the first send.

The guest tier gives a handful of turns a day (Qwen) and GLM gates the
first message with a slider captcha that a headless browser cannot pass.
Sign in (`/provider qwen` then `/provider login`, or run
`zames --headed --provider glm`). Guest mode is fine for a quick try, not for a
long task.

## Chromium system libraries are missing on Linux / WSL

Symptom: Chromium fails to start with a shared-library error
(`libnss3.so`, `libatk-1.0.so.0`, ...) - or the postinstall step says so.

What to do:

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium
```

The postinstall step tries the same when passwordless `sudo` is available.

## `/config set` reports success but the value is gone after a restart

Symptom: `/config set ui.locale en` applies live, but the next launch is
old.

A project `.zamesrc.json` beats the home config, and `/config` writes
only `~/.zames/config.json`. Look for the key in `<project>/.zamesrc.json`
and remove it there (it is ignored by git, so `git status` does not show it).
zames prints a warning at startup and right after the save (`cfg.shadowed`).
