// Render docs/demo.png — the terminal screenshot used in README.md.
//
// Why a generator instead of a live screenshot: the demo must be
// REPRODUCIBLE and ENGLISH (the README is English). A live capture depends on
// the operator's locale/theme/font and would drift. This renders a fixed HTML
// page that mirrors the REAL editor layout (src/input.ts _writeBlock) and the
// theme palette (src/theme.ts) with the DejaVu Sans Mono font that the
// container actually ships, then screenshots it with headless Chromium.
//
// Run:  npm run render-demo  (tsx scripts/render-demo.mts)
//
// Isolation: chromium.launch() uses a THROWAWAY profile, never ~/.zames/profile
// (see AGENTS.md — never touch the live agent's browser/profile).

import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs', 'demo.png')

const C = {
  bg: '#23272e',
  user: '#b4b8d0',
  prompt: '#c8b06a',
  dir: '#7fc4f0',
  assistant: '#cfc9b0',
  tool: '#c6a97e',
  toolResult: '#8a9bb5',
  system: '#808896',
  dim: '#5b616e',
  taskSummary: '#8fa3c8',
  toggleOn: '#6fd0b0',
}

const esc = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const span = (color: string, text: string, bold = false): string =>
  '<span style="color:' +
  color +
  (bold ? ';font-weight:700' : '') +
  '">' +
  esc(text) +
  '</span>'

// One rendered session, line by line (mirrors the real banner + answer flow).
const lines: string[] = []
const push = (html: string): void => {
  lines.push('<div class="l">' + html + '</div>')
}
const blank = () => push('&nbsp;')

push(span(C.system, 'Working directory: ') + span(C.dir, '/home/dev/zames_pro'))
push(span(C.system, 'Version: ') + span(C.user, '2.64.1'))
push(
  span(C.system, 'Transcript: ') +
    span(C.dim, '~/.zames/logs/zames_pro-2026-10-07.log'),
)
blank()
push(
  span(
    C.system,
    'Interactive mode. Enter a task. Commands — /help. Exit — /exit.',
  ),
)
push(
  span(
    C.system,
    'While the agent works you can type the next message — it goes to the queue (Enter — send, Esc — abort).',
  ),
)
push(
  span(
    C.dim,
    'Hint: "/" lists commands, Ctrl+R searches history, paste an image with Ctrl+Shift+V.',
  ),
)
blank()
push(
  span(C.prompt, '❯ ', true) +
    span(C.dir, 'zames_pro') +
    span(C.dim, ' › ') +
    span(C.user, 'Show the version from package.json.'),
)
blank()
push(span(C.tool, '🔧 Read') + ' ' + span(C.dim, '{"path":"package.json"}'))
push(
  span(C.toolResult, '   → ') +
    span(
      C.toolResult,
      '{\n  "name": "zames_pro",\n  "version": "2.64.1", …\n}',
    ),
)
blank()
push(span(C.assistant, '● Answer'))
push(
  span(C.assistant, 'The version in ') +
    '<span style="color:' +
    C.assistant +
    ';background:#2c313a;padding:0 3px;border-radius:3px">package.json</span>' +
    span(C.assistant, ' is ') +
    span(C.assistant, '2.64.1', true) +
    span(C.assistant, '.'),
)
blank()
push(span(C.taskSummary, '· duration: 6s · tools: 1 · tokens: 1.2k'))
push(span(C.dim, '─'.repeat(78)))

// Status line (right-aligned context + toggles) and the permanent input line.
const status =
  '<div class="l status"><span class="grow"></span>' +
  span(C.toggleOn, '🧠 ') +
  span(C.toggleOn, '🌐 ') +
  span(C.system, 'ctx: 12.4k · 1.2%') +
  '</div>'
const input =
  '<div class="l">' +
  span(C.prompt, '❯ ', true) +
  span(C.dir, 'zames_pro') +
  span(C.dim, ' › ')

const html =
  '<!doctype html><html><head><meta charset="utf-8"><style>' +
  '@font-face{font-family:ZM;src:local("DejaVu Sans Mono")}' +
  'html,body{margin:0;padding:0;background:' +
  C.bg +
  '}' +
  'body{font-family:"DejaVu Sans Mono","Noto Color Emoji",monospace;font-size:15px;line-height:1.45;' +
  'color:' +
  C.system +
  ';-webkit-font-smoothing:antialiased}' +
  '.screen{box-sizing:border-box;width:1197px;height:562px;padding:14px 18px;overflow:hidden;' +
  'display:flex;flex-direction:column}' +
  '.l{white-space:pre-wrap;word-break:break-word}' +
  '.status{display:flex;align-items:center;margin-top:auto}' +
  '.grow{flex:1}' +
  '</style></head><body><div class="screen">' +
  lines.join('') +
  status +
  input +
  '</div></body></html>'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1197, height: 562 },
    deviceScaleFactor: 2,
  })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: out })
  console.log('wrote', path.relative(root, out))
} finally {
  await browser.close()
}
