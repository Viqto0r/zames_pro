// Render the ANIMATED demo used on the GitHub Pages landing page: a scripted
// session replayed frame by frame (the typed prompt, the tool calls, the
// answer), so a visitor sees what a real run looks like without a video.
//
// Why a generator and not a recording: a live task is dominated by things we
// cannot control - the model's latency (5-20 s) and the send throttle (15 s on
// DeepSeek) - and every take differs. The UI, however, is driven imperatively
// (scripts/demo-replay.mts does exactly that for a screen recorder), so the
// same sequence can be produced deterministically here, in English, with a
// convincing cadence.
//
// Output: docs/demo-reel/frame-NNN.png + docs/demo-reel/reel.json (the frame
// timing). docs/assets/site.js plays it on the landing page; the last frame
// is also saved as docs/demo.png for the no-JS fallback and the social card.
//
// Run:  npm run render:demo-reel
//
// Isolation: chromium.launch() uses a THROWAWAY profile, never
// ~/.zames/profile (see AGENTS.md - never touch the live agent's browser).

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_PALETTES, DEFAULT_THEME } from '../src/theme.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'docs', 'demo-reel')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

// The palette is READ from src/theme.ts, not copied: the reel must show the
// real default theme and follow a palette change automatically. `bg` is the
// one value the theme object does not own (the terminal paints the
// background), so it comes from the palette.
const C: Record<string, string> = { ...ALL_PALETTES[DEFAULT_THEME] }

const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const span = (color: string, text: string, bold = false): string =>
  '<span style="color:' +
  color +
  (bold ? ';font-weight:700' : '') +
  '">' +
  esc(text) +
  '</span>'

// ---------- session model ----------
//
// A frame is the VISIBLE screen at one moment: the lines printed so far plus
// the current input line. Rendering every frame from the same model keeps the
// scrollback consistent instead of trying to animate one picture.

interface Frame {
  /** How long this screen stays before the next frame, ms. */
  delay: number
  /** Fully rendered HTML rows printed above the input line. */
  lines: string[]
  /** The prompt line content (what the operator has typed so far). */
  input?: string
}

const lines: string[] = []
const frames: Frame[] = []
const push = (html: string): void => {
  lines.push('<div class="l">' + html + '</div>')
}
const blank = (): void => push('&nbsp;')
const at = (delay: number, input?: string): void => {
  frames.push({ delay, lines: [...lines], input })
}

const VERSION = '2.95.3'
const WIDTH = 1080
const HEIGHT = 820

// Mirrors FullScreenApp's Header: ONE row `❯ zames vX` + the working
// directory, the provider badge on the right, then a full-width divider. The
// old box was the NON-TUI startup banner, which the full-screen UI never draws.
const header = (): void => {
  push(
    span(C.prompt, '❯ ', true) +
      span(C.assistant, 'zames') +
      span(C.dim, ' v' + VERSION) +
      span(C.dir, '  /home/dev/zames_pro') +
      ' '.repeat(30) +
      span(C.system, '[DeepSeek]'),
  )
  push(span(C.turnRule, '─'.repeat(96)))
}

const turn = (): void => {
  // The operator's turn separator + the BAR-marked message, like the real TUI:
  // a turn must never blend with the model's answer.
  push(span(C.turnRule, '-'.repeat(76)))
  push(
    '<span style="color:' +
      C.userBar +
      '">▌</span><span style="color:' +
      C.user +
      '"> what is zames_pro?</span>',
  )
  blank()
}

// Matches TuiEditor.toolCall/toolResult: the tool name with the wrench, then
// the result line with a check mark - NOT a "[tool]"/"ok" invention.
const tool = (name: string, detail: string, result: string): void => {
  push(
    span(C.tool, '\ud83d\udd27 ' + name) +
      (detail ? span(C.dim, '(' + detail + ')') : ''),
  )
  push(span(C.toolResult, '   \u2714 ') + span(C.toolResult, result))
}

// StatusBar badges, right aligned: provider, the thinking toggle and the
// context counter (StatusBar.statusBadges).
const status =
  span(C.system, '[DeepSeek] ') +
  span(C.toggleOn, '\ud83e\udde0\ufe0e ') +
  span(C.success, 'ctx: 12.4k \u00b7 1.2%')

// ---------- the script ----------
//
// The question is short on purpose: the demo is about the TOOL WORK, not a
// long prompt scrolling the screen.

header()
// A fresh full-screen chat is not blank: it shows editor.empty_hint until the
// first turn (FullScreenApp renders it in the log viewport).
push(
  span(
    C.dim,
    'Type a task and press Enter. /help for commands, \ + Enter for a new line.',
  ),
)
at(900)

const question = 'what is zames_pro?'
// Typing, one char per frame, ~28 ms each: fast enough to keep a visitor, slow
// enough to read as typing.
for (let i = 1; i <= question.length; i++) {
  at(28, question.slice(0, i))
}
at(420, question)

turn()
at(450, '')

push(span(C.dim, 'Thinking...'))
at(520, '')

tool(
  'Read',
  'package.json',
  '{ "name": "zames_pro", "version": "2.95.3", "bin": { "zames": "dist/index.js" } }',
)
at(420, '')

tool(
  'Grep',
  '/no API key/ *.md',
  'README.md:44  no API key required - it drives your own chat account',
)
at(380, '')

tool(
  'Glob',
  'docs/*.md',
  'docs/index.md  docs/themes.md  docs/commands.md  ... 4 more',
)
at(360, '')

tool(
  'Bash',
  'git log --oneline -3',
  '304ca5f docs(site): drop the themes button from the hero',
)
at(380, '')

tool('Bash', 'npm test -- --runInBand', '# pass 1288  # fail 0  (31 s)')
at(420, '')

push(span(C.dim, 'Writing the answer...'))
at(460, '')

blank()
push(span(C.assistant, '\u25cf Answer'))
push(
  span(
    C.assistant,
    'zames_pro is a free, open-source terminal coding agent that drives a',
  ),
)
push(
  span(C.assistant, 'real web chat through a browser: DeepSeek, Qwen or GLM -'),
)
push(span(C.assistant, 'no API key and no per-token bill.'))
push(
  span(
    C.assistant,
    'It reads and edits files, runs commands and commits to git, like',
  ),
)
push(span(C.assistant, 'Claude Code or Codex CLI.'))
push(
  span(
    C.assistant,
    'Tools: Read, Write, Edit, Bash, Glob, Grep, git, MCP; AGENTS.md,',
  ),
)
push(span(C.assistant, 'skills and subagents are supported.'))
push(
  span(C.assistant, 'Install: ') +
    span(C.dir, 'npm install -g zames_pro') +
    span(C.assistant, ' then run ') +
    span(C.dir, 'zames') +
    span(C.assistant, ' in a project.'),
)
// Hold the finished answer long enough to read it, then the player loops.
at(4800, '')

// ---------- render ----------
//
// JPEG at deviceScaleFactor 1: a reel of ~30 frames must stay small in git.
// The page swaps <img src> on a timer, so no video codec is involved.

const css =
  'html,body{margin:0;padding:0;background:' +
  C.bg +
  ';font-family:"DejaVu Sans Mono","Noto Color Emoji",monospace;font-size:14px;' +
  'line-height:1.4;color:' +
  C.system +
  ';-webkit-font-smoothing:antialiased}' +
  '.screen{box-sizing:border-box;width:' +
  WIDTH +
  'px;height:' +
  HEIGHT +
  'px;padding:14px 18px;overflow:hidden;display:flex;flex-direction:column}' +
  '.l{white-space:pre-wrap;word-break:break-word}' +
  '.status{display:flex;align-items:center;margin-top:auto}' +
  '.grow{flex:1}' +
  '.cursor{display:inline-block;width:8px;height:1.1em;background:' +
  C.dir +
  ';vertical-align:text-bottom}'

function page(f: Frame): string {
  const rows = f.lines.join('')
  // The input BOX from InputLine.tsx (borderStyle 'round', one column of
  // padding) with the prompt INSIDE it, and the one-line key hint UNDER it.
  // The old "zames_pro /" label came from nowhere: buildPrompt() returns a
  // bare '❯ ' (the directory lives in the header).
  const inner = 94
  const typed = esc(f.input || '')
  const input =
    '<div class="l">' +
    span(C.border, '╭' + '─'.repeat(inner) + '╮') +
    '</div>' +
    '<div class="l">' +
    span(C.border, '│ ') +
    span(C.prompt, '❯ ', true) +
    typed +
    '<span class="cursor"></span>' +
    ' '.repeat(Math.max(1, inner - 3 - (f.input || '').length)) +
    span(C.border, '│') +
    '</div>' +
    '<div class="l">' +
    span(C.border, '╰' + '─'.repeat(inner) + '╯') +
    '</div>' +
    '<div class="l">' +
    span(
      C.dim,
      ' wheel - scroll · select - Shift+click · Esc - stop · PgUp/PgDn · Home/End',
    ) +
    '</div>'
  return (
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    css +
    '</style></head><body><div class="screen">' +
    rows +
    '<div class="l status"><span class="grow"></span>' +
    status +
    '</div>' +
    input +
    '</div></body></html>'
  )
}

const browser = await chromium.launch({ headless: true })
try {
  const pageHandle = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  })
  // JPEG, quality 82: a terminal screenshot is flat color and crisp text, and
  // a 29-frame reel of lossless PNGs weighed ~1.1 MB in the repo. The same
  // frames as JPEG are a fraction of that; at 1x a soft edge on a glyph is
  // invisible on the site.
  const names: string[] = []
  for (let i = 0; i < frames.length; i++) {
    await pageHandle.setContent(page(frames[i]), { waitUntil: 'load' })
    const name = 'frame-' + String(i + 1).padStart(3, '0') + '.jpg'
    await pageHandle.screenshot({
      path: path.join(outDir, name),
      type: 'jpeg',
      quality: 82,
    })
    names.push(name)
  }
  // The still hero image is the LAST frame: the reel starts with an almost
  // empty screen, which is a terrible social card.
  fs.copyFileSync(
    path.join(outDir, names[names.length - 1]),
    path.join(root, 'docs', 'demo.png'),
  )
} finally {
  await browser.close()
}

fs.writeFileSync(
  path.join(outDir, 'reel.json'),
  JSON.stringify(
    {
      width: WIDTH,
      height: HEIGHT,
      frames: frames.map((f, i) => ({
        src: 'frame-' + String(i + 1).padStart(3, '0') + '.jpg',
        delay: f.delay,
      })),
    },
    null,
    2,
  ) + '\n',
)

console.log('wrote', frames.length, 'frames to', path.relative(root, outDir))
