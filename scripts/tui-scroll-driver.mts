// Press keys on the scroll probe and print the scroll values it saw. Accepts
// several End/Home encodings so a terminal that sends a non-xterm form can be
// diagnosed.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const ESC = String.fromCharCode(27)
const LOG = '/tmp/scroll-probe.log'
try {
  fs.unlinkSync(LOG)
} catch {
  /* ignore */
}
const map: Record<string, string> = {
  PGUP: ESC + '[5~',
  PGDN: ESC + '[6~',
  HOME: ESC + '[H',
  END: ESC + '[F',
  END4: ESC + '[4~',
  HOME1: ESC + '[1~',
  CEND: ESC + '[1;5F',
  CHOME: ESC + '[1;5H',
  SPGDN: ESC + '[6;2~',
  SPGUP: ESC + '[5;2~',
}
const keys = (process.argv[2] || 'PGUP').split(',').map((k) => map[k] ?? k)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-scroll-probe.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: '80', LINES: '24', PROBE_SCROLL_LOG: LOG },
  },
)
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})
let i = 0
const tick = (): void => {
  if (i < keys.length) {
    child.stdin.write(keys[i])
    i++
    setTimeout(tick, 250)
  } else setTimeout(() => child.kill('SIGTERM'), 400)
}
setTimeout(tick, 5000)
child.on('close', () => {
  const lines = fs
    .readFileSync(LOG, 'utf-8')
    .trim()
    .split(String.fromCharCode(10))
  console.log('SCROLL=' + JSON.stringify(lines.map(Number)))
  process.exit(0)
})
