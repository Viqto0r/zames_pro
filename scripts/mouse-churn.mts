// Prove the mouse-mode churn is ZERO: mount the REAL TuiEditor, force several
// store updates (like the 1s badge refresh does), and COUNT how many times the
// raw stdout receives the mouse-mode sequences. With the effect depending on
// an inline onWheel, the count grew per render (the wheel-vs-history bug);
// with the ref fix, each mode byte is written ONCE.
//
// Exit code 0 = OK, 1 = churn detected. Prints a one-line verdict so the pty
// test can assert on it.

import { spawn } from 'node:child_process'
import path from 'node:path'

const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-mouse-churn-probe.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: '80', LIMES: '24' },
  },
)
let out = ''
child.stdout.on('data', (d) => (out += d.toString('utf-8')))
child.stderr.on('data', (d) => (out += d.toString('utf-8')))
setTimeout(() => child.kill('SIGTERM'), 8000)
child.on('close', () => {
  const count = (seq: string): number => out.split(seq).length - 1
  const on = count('\u001b[?1000h')
  const altOff = count('\u001b[?1007l')
  const altOn = count('\u001b[?1007h')
  console.log(
    'MOUSE_CHURN 1000h=' + on + ' 1007l=' + altOff + ' 1007h=' + altOn,
  )
  const ok = on === 1 && altOff === 1 && altOn === 0
  console.log(ok ? 'MOUSE_CHURN_OK' : 'MOUSE_CHURN_FAIL')
  process.exit(ok ? 0 : 1)
})
