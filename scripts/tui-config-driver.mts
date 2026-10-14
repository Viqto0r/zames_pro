// Drive scripts/tui-config-probe.tsx under a pty: send keys one at a time,
// screenshot the VT100 grid at the end, and print the probe's set/reset log.
// Used by test/tui-pty-render.test.ts to pin the config-menu regressions
// (the stale value after a toggle, and the overflowing block at a small
// terminal).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Term } from '../test/vt100.mts'

const ESC = String.fromCharCode(27)
const NL = String.fromCharCode(10)

function arg(name: string, def = ''): string {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3) : def
}
const cols = Number(arg('cols', '90'))
const rows = Number(arg('rows', '30'))
const keys = arg('keys', '')
  .split(',')
  .filter((s) => s.length > 0)
  .map((s) =>
    s === 'RIGHT'
      ? ESC + '[C'
      : s === 'LEFT'
        ? ESC + '[D'
        : s === 'DOWN'
          ? ESC + '[B'
          : s === 'UP'
            ? ESC + '[A'
            : s === 'ENTER'
              ? String.fromCharCode(13)
              : s,
  )

const LOG = '/tmp/config-probe.log'
try {
  fs.unlinkSync(LOG)
} catch {
  /* ignore */
}

const term = new Term(rows, cols)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-config-probe.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: String(cols),
      LINES: String(rows),
      PROBE_CONFIG_LOG: LOG,
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
    setTimeout(tick, 220)
  } else {
    setTimeout(() => {
      process.stdout.write('===SCREEN===' + NL)
      process.stdout.write(term.render() + NL)
      process.stdout.write('===LOG===' + NL)
      try {
        process.stdout.write(fs.readFileSync(LOG, 'utf-8'))
      } catch {
        /* ignore */
      }
      child.kill('SIGTERM')
    }, 500)
  }
}
setTimeout(tick, 5000)
child.on('close', () => process.exit(0))
