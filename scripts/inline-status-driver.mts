import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'
const NL = String.fromCharCode(10)
const term = new Term(12, 60)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/inline-status.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: '60', LINES: '12' },
  },
)
child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
child.stderr.on('data', (d) => term.write(d.toString('utf-8')))
setTimeout(() => {
  const g = term.grid
  if (g[term.r]) g[term.r][term.c] = String.fromCharCode(9673)
  process.stdout.write(
    g
      .map((r) => r.join('').replace(/\s+$/, ''))
      .map((l, n) => String(n).padStart(2) + '| ' + l)
      .join(NL) +
      NL +
      'CURSOR row=' +
      term.r +
      NL,
  )
  child.kill('SIGTERM')
}, 5000)
child.on('close', () => process.exit(0))
