// Drive scripts/tui-wheel-probe.tsx under a pty and send REAL SGR wheel events
// (mouse reporting must be on for these to arrive; the probe sets nothing, so
// this also proves the SCROLL mode sequences are emitted). Prints the buffer
// and scroll transitions the probe logged: the buffer must NEVER change and
// the scroll must INCREASE on wheel-up.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ESC = String.fromCharCode(27)
const LOG = '/tmp/wheel-probe.log'
const SCROLL = process.argv.includes('--scroll')
// SGR wheel-up = Cb 64, wheel-down = 65: ESC [ < 64 ; col ; row M
try {
  fs.unlinkSync(LOG)
} catch {
  /* ignore */
}

const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-wheel-probe.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: '80',
      LINES: '24',
      PROBE_WHEEL_LOG: LOG,
      ...(SCROLL ? { PROBE_MOUSE_SCROLL: '1' } : {}),
    },
  },
)
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})

setTimeout(() => {
  // Five wheel-up notches.
  for (let i = 0; i < 5; i++) {
    child.stdin.write(ESC + '[<64;10;10M')
    setTimeout(() => {}, 50)
  }
  setTimeout(() => child.kill('SIGTERM'), 800)
}, 6000)

child.on('close', () => {
  let lines: string[] = []
  try {
    lines = fs.readFileSync(LOG, 'utf-8').trim().split(String.fromCharCode(10))
  } catch {
    /* ignore */
  }
  const parsed = lines.map(
    (l) => JSON.parse(l) as { buf: string; scroll: number },
  )
  const bufs = [...new Set(parsed.map((p) => p.buf))]
  const scrolls = parsed.map((p) => p.scroll)
  console.log('BUFS=' + JSON.stringify(bufs))
  console.log('SCROLLS=' + JSON.stringify(scrolls))
  process.exit(0)
})
