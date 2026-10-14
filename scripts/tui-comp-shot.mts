// Screenshot a standalone TUI component under a pty, optionally driving keys.
// Usage: npx tsx scripts/tui-comp-shot.mts --component=select --keys=j,j --cols=80 --rows=24
import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'

const ESC = String.fromCharCode(27)
const NL = String.fromCharCode(10)
function arg(name: string, def = ''): string {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3) : def
}
const component = arg('component', 'select')
const cols = Number(arg('cols', '80'))
const rows = Number(arg('rows', '24'))
const keys = arg('keys', '')
  .split(',')
  .filter((s) => s.length > 0)
  .map((s) =>
    s === 'UP'
      ? ESC + '[A'
      : s === 'DOWN'
        ? ESC + '[B'
        : s === 'TAB'
          ? String.fromCharCode(9)
          : s === 'ENTER'
            ? String.fromCharCode(13)
            : s === 'ESC'
              ? ESC
              : s,
  )

const term = new Term(rows, cols)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-components.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: String(cols),
      LINES: String(rows),
      PROBE_COMPONENT: component,
    },
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
  } else {
    setTimeout(() => {
      process.stdout.write(term.render() + NL)
      child.kill('SIGTERM')
    }, 400)
  }
}
setTimeout(tick, 4500)
child.on('close', () => process.exit(0))
