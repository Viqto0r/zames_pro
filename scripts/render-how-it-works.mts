// Render docs/how-it-works.png — the "How it works" flowchart used in
// README.md. Reproduces the ORIGINAL mermaid `flowchart LR` look (rounded
// lavender nodes, gray arrows, white background, a simple left-to-right
// chain) so the diagram stays visually the same as before. The ONLY change:
// the model node now shows BOTH supported backends (chat.deepseek.com /
// chat.qwen.ai) instead of only chat.deepseek.com.
//
// Layout matches mermaid LR: FORWARD edges (the request) run through the node
// centerline left->right; BACK edges (the answers) are routed BELOW the boxes
// with a short vertical stub on each side, so forward and back arrows are
// clearly separated instead of overlapping.
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
const NODE_W = 250
const NODE_H = 70
const PAD = 30
const TOP = 34
const CY = TOP + NODE_H / 2
// The back edges run below the boxes; leave room for them + their labels.
const BACK_Y = TOP + NODE_H + 46
const H = BACK_Y + 30
const GAP = 150

interface Node {
  x: number
  w: number
  lines: string[]
}

const nodes: Node[] = [
  { x: PAD, w: NODE_W, lines: ['terminal (you)'] },
  {
    x: PAD + NODE_W + GAP,
    w: 260,
    lines: ['zames', 'parse tool-call · run tool'],
  },
  {
    x: PAD + NODE_W + GAP + 260 + GAP,
    w: 260,
    lines: ['chat.deepseek.com', 'chat.qwen.ai'],
  },
]

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const nodeSvg = (n: Node): string => {
  const y = TOP
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

const label = (x: number, y: number, text: string): string =>
  '<text x="' +
  x +
  '" y="' +
  y +
  '" text-anchor="middle" font-family="' +
  FONT +
  '" font-size="12" fill="' +
  TEXT +
  '">' +
  esc(text) +
  '</text>'

// A FORWARD edge: a straight horizontal arrow at the node centerline, going
// left->right, with the label just above the line.
const forward = (x1: number, x2: number, text: string): string => {
  const mid = (x1 + x2) / 2
  return (
    '<path d="M' +
    x1 +
    ' ' +
    CY +
    ' L' +
    x2 +
    ' ' +
    CY +
    '" fill="none" stroke="' +
    TEXT +
    '" stroke-width="1.6" marker-end="url(#ar)"/>' +
    label(mid, CY - 9, text)
  )
}

// A BACK edge: from the RIGHT box's bottom edge, DOWN to BACK_Y, LEFT, then UP
// into the LEFT box's bottom edge, with the arrowhead pointing up-left into it.
const back = (leftX: number, rightX: number, text: string): string => {
  // leftX = right edge of the LEFT node; rightX = left edge of the RIGHT node.
  const ly = TOP + NODE_H
  const d =
    'M' +
    rightX +
    ' ' +
    ly +
    ' L' +
    rightX +
    ' ' +
    BACK_Y +
    ' L' +
    leftX +
    ' ' +
    BACK_Y +
    ' L' +
    leftX +
    ' ' +
    ly
  const mid = (leftX + rightX) / 2
  return (
    '<path d="' +
    d +
    '" fill="none" stroke="' +
    TEXT +
    '" stroke-width="1.6" marker-end="url(#ar)"/>' +
    label(mid, BACK_Y - 6, text)
  )
}

const a = nodes[0]
const z = nodes[1]
const m = nodes[2]

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
  // ONE right-pointing arrowhead, tip at local (10,5) so refX=10/refY=5 lands
  // the tip exactly on the path end. `orient="auto"` rotates the marker to
  // follow the path tangent, so the SAME marker works for a horizontal forward
  // edge and for the vertical/up back edge. (Authoring the up arrow as an
  // up-pointing triangle was the bug: orient=auto rotated it AGAIN, giving the
  // crooked tip.)
  '<marker id="ar" markerWidth="12" markerHeight="12" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" fill="' +
  TEXT +
  '"/></marker>' +
  '</defs>' +
  '<rect width="100%" height="100%" fill="#ffffff"/>' +
  // back edges first (drawn under the forward edges / nodes).
  // back(leftEdgeRightX, rightEdgeLeftX, label): the arrow starts at the RIGHT
  // box's bottom, runs down-left, and points up into the LEFT box's bottom.
  back(z.x + z.w, m.x, 'model answers (raw SSE)') +
  back(a.x + a.w, z.x, 'answer') +
  // forward edges
  forward(a.x + a.w, z.x, 'task') +
  forward(z.x + z.w, m.x, 'system prompt + task') +
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
