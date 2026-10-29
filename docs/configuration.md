---
layout: doc
title: 'Configuration and themes'
description: 'All zames_pro settings, the /config command and the 29 bundled terminal color themes.'
lang: en
alt_url: /configuration-ru.html
---

<div class="wrap" markdown="1">

### Configuration

Global config: `~/.zames/config.json`
Local (per project): `.zamesrc.json`

You can view and change settings without leaving the agent — use the
`/config` command. Run it without arguments to open an interactive menu
(↑/↓ to move, Enter to change, `d` to reset, `q` to quit). Booleans and enums
toggle in place; numbers and strings open an input prompt.

```
/config                       interactive settings menu (alias: menu)
/config list                  print all editable settings (aliases: show, ls)
/config get <path>            show a setting
/config set <path> <value>    change a setting
/config reset <path>          reset a setting to its default (alias: unset)
/config path                  show config file paths (alias: paths)
/config lang <ru|en>          switch interface and agent language
                              (aliases: language, язык)
```

Examples:

```
/config set maxIterations 20
/config set browser.deepThinking true   # DeepSeek Deep thinking (slow; reasoning is hidden)
/config set browser.webSearch false     # DeepSeek Smart web search
/config lang en
```

Changes are written to the HOME config (`~/.zames/config.json`), NOT to the
project `.zamesrc.json` — a personal toggle must not leak into git — and applied
right away (where possible without a restart).

#### Language

`/config lang ru` or `/config lang en` switches both the interface language
(help, messages, spinner) and the language the agent answers you in. The
locale lives in `ui.locale` in the config file.

#### Themes

`/theme` opens a pick list with a LIVE preview: the arrow keys repaint the
terminal as you move, Enter saves, Esc restores the previous palette.
`/theme <id>` applies a palette directly, `/theme list` prints every id.
The switch also works WHILE the agent is generating: `/theme <id>` and
`/config set ui.theme <id>` neither interrupt the turn nor touch the chat (it is
a pure terminal repaint); the bare `/theme` pick list is queued instead, because
it opens a full-screen list.
The same setting is reachable from the settings side:
`/config set ui.theme <id>` or the `/config` menu («Terminal color theme»).
The switch is instant, no restart. `zames` is the default; the bundled palettes
are ports of well-known editor schemes:

`zames` (default), `one-dark`, `dracula`, `gruvbox`, `nord`, `monokai`,
`solarized-dark`, `tokyo-night`, `tokyo-storm`, `catppuccin`, `github-dark`,
`ayu`, `rose-pine`, `everforest`, `kanagawa`, `night-owl`, `material`,
`palenight`, `zenburn`, `selenized`, `iceberg`, `sonokai`, `aurora`, `cobalt2`,
plus the LIGHT ones: `one-light`, `github-light`, `solarized-light`,
`gruvbox-light`, `ayu-light`.

A theme repaints EVERYTHING: the interface, the agent's answers, the code
highlighting inside them, the status row and the input frame. The terminal's
BACKGROUND follows too: the theme emits OSC-11 with the palette's `bg`
(supported by iTerm2, Windows Terminal, kitty, WezTerm, Alacritty, GNOME
Terminal and others; where it is not supported nothing happens). Opt out with
`ZAMES_NO_BG=1` or `NO_COLOR`.
To make the choice
concrete, a SAMPLE SESSION in that palette is shown before you pick (in `/theme`
below the list, in `/config` press `p` on the theme row); it is not dumped into
the chat after a pick. Every one of the 29 themes has a screenshot in
`docs/shots/`. The frame itself is a separate
setting: `/config set ui.inputBorder <round|single|double|bold|none>`
(default `round`; `none` removes it). A multi-line operator message keeps its
`▌` bar on every row.

Agent data is stored in `~/.zames`: browser profile, logs, undo history, sessions.

</div>
