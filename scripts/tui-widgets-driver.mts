import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'
const NL = String.fromCharCode(10)
const term = new Term(16, 60)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-widgets.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: '60', LINES: '16' },
  },
)
child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
child.stderr.on('data', (d) => term.write(d.toString('utf-8')))
setTimeout(() => {
  process.stdout.write(term.render() + NL)
  child.kill('SIGTERM')
}, 5000)
child.on('close', () => process.exit(0))
