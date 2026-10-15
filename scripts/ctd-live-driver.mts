// Drive the live-like probe: type a seed, then send Ctrl+Delete in EVERY
// encoding a terminal might use, and print the raw bytes + the buffer.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ESC = String.fromCharCode(27)
const LOG = '/tmp/ctd-live.log'
try {
  fs.unlinkSync(LOG)
} catch {
  /* ignore */
}

const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/ctd-live.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: '80', LINES: '24', PROBE_CTD_LOG: LOG },
  },
)
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})

const seq = process.argv[2] || 'xterm'
const enc: Record<string, string> = {
  xterm: ESC + '[3;5~',
  kitty: ESC + '[3;5u',
  vt: ESC + '[3;5:1~',
}
const bytes = enc[seq] ?? seq

setTimeout(() => {
  child.stdin.write('foo bar baz') // seed
  setTimeout(() => {
    child.stdin.write(bytes) // the Ctrl+Delete encoding
    setTimeout(() => {
      const log = fs.readFileSync(LOG, 'utf-8')
      process.stdout.write('=== ' + seq + ' ===' + String.fromCharCode(10))
      process.stdout.write(
        log
          .split(String.fromCharCode(10))
          .filter((l) => l.startsWith('RAW') || l.startsWith('BUF'))
          .join(String.fromCharCode(10)) + String.fromCharCode(10),
      )
      child.kill('SIGTERM')
    }, 500)
  }, 400)
}, 5000)
child.on('close', () => process.exit(0))
