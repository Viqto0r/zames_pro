// Screenshot the REAL FullScreenApp input box for a given buffer/cursor, and
// print the VT100 grid WITH a cursor marker (the real terminal cursor cell).
import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'

const NL = String.fromCharCode(10)
function arg(name: string, def = ''): string {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3) : def
}
const cols = Number(arg('cols', '80'))
const rows = Number(arg('rows', '24'))
const buf = arg('buf', '')
  .replace(/\\n/g, NL)
  .replace(/\\t/g, String.fromCharCode(9))
const cursor = arg('cursor', '')

const term = new Term(rows, cols)
let stderr = ''
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-input-shot.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: String(cols),
      LINES: String(rows),
      PROBE_BUF: buf,
      ...(cursor ? { PROBE_CURSOR: cursor } : {}),
    },
  },
)
child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
child.stderr.on('data', (d) => (stderr += d.toString('utf-8')))
setTimeout(() => {
  const cr = term.r
  const cc = term.c
  // Mark by GRID CELL, not by string index: a wide char occupies two grid
  // cells, so slicing the rendered string would place the marker wrong.
  const grid = term.grid
  if (grid[cr] && grid[cr][cc] !== undefined)
    grid[cr][cc] = String.fromCharCode(9673)
  const lines = grid.map((row) => row.join('').replace(/\s+$/, ''))
  process.stdout.write(
    lines.map((l, n) => String(n).padStart(2) + '| ' + l).join(NL) + NL,
  )
  process.stdout.write('CURSOR row=' + cr + ' col=' + cc + NL)
  const lay = stderr.split(NL).find((l) => l.startsWith('LAYOUT'))
  if (lay) process.stdout.write(lay + NL)
  child.kill('SIGTERM')
}, 5000)
child.on('close', () => process.exit(0))
