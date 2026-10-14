import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'
const NL = String.fromCharCode(10)
const cols = Number(
  (process.argv.find((a) => a.startsWith('--cols=')) || '--cols=80').slice(7),
)
const rows = 8
const term = new Term(rows, cols)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-status-shot.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: String(cols), LINES: String(rows) },
  },
)
child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
child.stderr.on('data', (d) => term.write(d.toString('utf-8')))
setTimeout(() => {
  process.stdout.write(term.render() + NL)
  child.kill('SIGTERM')
}, 5000)
child.on('close', () => process.exit(0))
