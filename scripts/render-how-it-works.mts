// Render docs/how-it-works.png — the architecture diagram used in README.md.
//
// Why a generator: the README must show BOTH chat backends (DeepSeek and
// Qwen), not just DeepSeek. A hand-drawn PNG drifts; this renders a fixed
// HTML page with headless Chromium so the diagram is reproducible and easy to
// update when a provider is added.
//
// Run:  npm run render-how  (tsx scripts/render-how-it-works.mts)
//
// Isolation: chromium.launch() uses a THROWAWAY in-memory context, never
// ~/.zames/profile (see AGENTS.md — never touch the live agent's browser).

import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs', 'how-it-works.png')

const C = {
  bg: '#23272e',
  panel: '#2b303a',
  border: '#3b4250',
  text: '#cfc9b0',
  dim: '#8a9bb5',
  user: '#b4b8d0',
  accent: '#7fc4f0',
  ds: '#6f8ed0',
  qwen: '#6fd0b0',
  tool: '#c6a97e',
}

const W = 1300
const H = 360

const box = (
  title: string,
  sub: string,
  color: string,
): string =>
  '<div class="box" style="border-color:' +
  color +
  '">' +
  '<div class="box-t" style="color:' +
  color +
  '">' +
  title +
  '</div>' +
  '<div class="box-s">' +
  sub +
  '</div></div>'

const html =
  '<!doctype html><html><head><meta charset="utf-8"><style>' +
  '@font-face{font-family:ZM;src:local("DejaVu Sans Mono")}' +
  'html,body{margin:0;padding:0;background:' +
  C.bg +
  '}' +
  'body{font-family:"DejaVu Sans Mono",monospace;color:' +
  C.text +
  ';-webkit-font-smoothing:antialiased}' +
  '.wrap{box-sizing:border-box;width:' +
  W +
  'px;height:' +
  H +
  'px;padding:26px 30px}' +
  '.row{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
  '.box{box-sizing:border-box;border:2px solid;border-radius:10px;padding:14px 16px;' +
  'background:' +
  C.panel +
  ';min-width:150px;text-align:center}' +
  '.box-t{font-size:18px;font-weight:700;margin-bottom:6px}' +
  '.box-s{font-size:12px;color:' +
  C.dim +
  ';line-height:1.5}' +
  '.arrow{font-size:26px;color:' +
  C.dim +
  '}' +
  '.flow-label{font-size:12px;color:' +
  C.dim +
  ';text-align:center;margin-top:4px}' +
  '.providers{display:flex;flex-direction:column;gap:10px}' +
  '.col{display:flex;flex-direction:column;align-items:center;gap:4px}' +
  '.legend{margin-top:20px;font-size:12px;color:' +
  C.dim +
  ';text-align:center}' +
  '.legend b{color:' +
  C.text +
  '}' +
  '</style></head><body><div class="wrap">' +
  '<div class="row">' +
  // left: the operator
  '<div class="col">' +
  box('Operator', 'terminal task<br/>+ tool approval', C.user) +
  '<div class="flow-label">types a task</div>' +
  '</div>' +
  '<div class="arrow">&#8594;</div>' +
  // middle: zames
  '<div class="col">' +
  box(
    'zames',
    'sandboxed tools<br/>parses tool-calls<br/>runs them locally',
    C.accent,
  ) +
  '<div class="flow-label">system prompt + task</div>' +
  '</div>' +
  '<div class="arrow">&#8644;</div>' +
  // right: the two backends
  '<div class="providers">' +
  box('DeepSeek', 'chat.deepseek.com<br/>~/.zames/profile', C.ds) +
  box('Qwen', 'chat.qwen.ai<br/>~/.zames/qwen-profile', C.qwen) +
  '</div>' +
  '</div>' +
  '<div class="legend">zames drives a <b>real browser</b> over a persistent per-provider profile &mdash; no API key. ' +
  'Switch live with <b>/provider &lt;deepseek|qwen&gt;</b> (each chat id belongs to one backend).</div>' +
  '</div></body></html>'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: out })
  console.log('wrote', path.relative(root, out))
} finally {
  await browser.close()
}
