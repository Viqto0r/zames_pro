// Send `ESC d` (what VSCode sends for Ctrl+Delete) to the REAL TuiEditor and
// print the resulting buffer.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const ESC = String.fromCharCode(27)
const LOG = '/tmp/ctd-live.log'
try {
  fs.unlinkSync(LOG)
} catch {}
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
setTimeout(() => {
  child.stdin.write('foo bar baz')
  setTimeout(() => {
    child.stdin.write(ESC + 'd')
    setTimeout(() => {
      const log = fs.readFileSync(LOG, 'utf-8')
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
