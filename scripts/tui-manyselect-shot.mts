import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'
const NL = String.fromCharCode(10)
const ESC = String.fromCharCode(27)
const keys = (process.argv[2] || '')
  .split(',')
  .filter(Boolean)
  .map((k) => (k === 'UP' ? ESC + '[A' : k === 'DOWN' ? ESC + '[B' : k))
const term = new Term(20, 60)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-manyselect.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: '60', LINES: '20' },
  },
)
child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
child.stderr.on('data', (d) => term.write(d.toString('utf-8')))
let i = 0
const tick = (): void => {
  if (i < keys.length) {
    child.stdin.write(keys[i])
    i++
    setTimeout(tick, 250)
  } else
    setTimeout(() => {
      process.stdout.write(term.render() + NL)
      child.kill('SIGTERM')
    }, 400)
}
setTimeout(tick, 4500)
child.on('close', () => process.exit(0))
