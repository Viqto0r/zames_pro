// Render docs/how-it-works.png — the "How it works" flowchart used in
// README.md. Reproduces the ORIGINAL mermaid `flowchart LR` look (rounded
// lavender nodes, gray arrows, white background, a simple left-to-right
// chain) so the diagram stays visually the same as before. The ONLY change:
// the model node now shows BOTH supported backends (chat.deepseek.com /
// chat.qwen.ai) instead of only chat.deepseek.com.
//
// Run:  npm run render-how  (tsx scripts/render-how-it-works.mts)
//
// Isolation: chromium.launch() uses a THROWAWAY context, never
// ~/.zames/profile (see AGENTS.md — never touch the live agent's browser).

import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs', 'how-it-works.png')

// Mermaid default-theme palette (matches the previous diagram).
const FILL = '#ECECFF'
const STROKE = '#9370DB'
const TEXT = '#333333'
const FONT = 'trebuchet ms, verdana, arial, sans-serif'

const W = 1120
const H = 150
const NODE_W = 250
const NODE_H = 70
const CY = H / 2
const PAD = 30

// A left-to-right chain with the SAME three steps as the original diagram;
// only the last node gained a second line (the two supported backends).
interface Node {
  x: number
  w: number
  lines: string[]
}

const nodes: Node[] = [
  { x: PAD, w: NODE_W, lines: ['terminal (you)'] },
  {
    x: PAD + NODE_W + 150,
    w: 260,
    lines: ['zames', 'parse tool-call · run tool'],
  },
  {
    x: PAD + NODE_W + 150 + 260 + 150,
    w: 260,
    lines: ['chat.deepseek.com', 'chat.qwen.ai'],
  },
]

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const nodeSvg = (n: Node): string => {
  const y = CY - NODE_H / 2
  const rx = 12
  const lh = 20
  const startY = CY - ((n.lines.length - 1) * lh) / 2 + 5
  const cx = n.x + n.w / 2
  const texts = n.lines
    .map(
      (t, i) =>
        '<text x="' +
        cx +
        '" y="' +
        (startY + i * lh) +
        '" text-anchor="middle" font-family="' +
        FONT +
        '" font-size="15" fill="' +
        TEXT +
        '">' +
        esc(t) +
        '</text>',
    )
    .join('')
  return (
    '<rect x="' +
    n.x +
    '" y="' +
    y +
    '" width="' +
    n.w +
    '" height="' +
    NODE_H +
    '" rx="' +
    rx +
    '" ry="' +
    rx +
    '" fill="' +
    FILL +
    '" stroke="' +
    STROKE +
    '" stroke-width="2"/>' +
    texts
  )
}

// A horizontal edge from x1 to x2 at height y, with a centered label above it.
const edge = (
  x1: number,
  x2: number,
  y: number,
  label: string,
  dir: 'r' | 'l',
): string => {
  const mid = (x1 + x2) / 2
  const marker = dir === 'r' ? 'ar' : 'al'
  return (
    '<path d="M' +
    x1 +
    ' ' +
    y +
    ' L' +
    x2 +
    ' ' +
    y +
    '" fill="none" stroke="' +
    TEXT +
    '" stroke-width="1.6" marker-end="url(#' +
    marker +
    ')"/>' +
    '<text x="' +
    mid +
    '" y="' +
    (y - 8) +
    '" text-anchor="middle" font-family="' +
    FONT +
    '" font-size="12" fill="' +
    TEXT +
    '">' +
    esc(label) +
    '</text>'
  )
}

const a = nodes[0]
const z = nodes[1]
const m = nodes[2]

const reqY = CY - 16
const ansY = CY + 20

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="' +
  W +
  '" height="' +
  H +
  '" viewBox="0 0 ' +
  W +
  ' ' +
  H +
  '">' +
  '<defs>' +
  '<marker id="ar" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L9,3 L0,6 z" fill="' +
  TEXT +
  '"/></marker>' +
  '<marker id="al" markerWidth="10" markerHeight="10" refX="1" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M9,0 L0,3 L9,6 z" fill="' +
  TEXT +
  '"/></marker>' +
  '</defs>' +
  '<rect width="100%" height="100%" fill="#ffffff"/>' +
  // request edges (top, left -> right)
  edge(a.x + a.w, z.x, reqY, 'task', 'r') +
  edge(z.x + z.w, m.x, reqY, 'system prompt + task', 'r') +
  // answer edges (bottom, right -> left)
  edge(m.x, z.x + z.w, ansY, 'model answers (raw SSE)', 'l') +
  edge(z.x, a.x + a.w, ansY, 'answer', 'l') +
  nodes.map(nodeSvg).join('') +
  '</svg>'

const html =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head><body>' +
  svg +
  '</body></html>'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  })
  await page.setContent(html, { waitUntil: 'load' })
  const el = await page.$('svg')
  await (el || page).screenshot({ path: out })
  console.log('wrote', path.relative(root, out))
} finally {
  await browser.close()
}
