// Screenshot the FullScreenApp log for a given content spec.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'

const NL = String.fromCharCode(10)
function arg(n: string, d = ''): string {
  const h = process.argv.find((a) => a.startsWith('--' + n + '='))
  return h ? h.slice(n.length + 3) : d
}
const cols = Number(arg('cols', '80'))
const rows = Number(arg('rows', '24'))
const spec = arg('log', 'empty')

const term = new Term(rows, cols)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-log-shot.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: String(cols),
      LINES: String(rows),
      PROBE_LOG: spec,
    },
  },
)
child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
child.stderr.on('data', (d) => term.write(d.toString('utf-8')))
setTimeout(() => {
  process.stdout.write(term.render() + NL)
  child.kill('SIGTERM')
}, 5000)
child.on('close', () => process.exit(0))
