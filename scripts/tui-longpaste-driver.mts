// Paste a long bracketed block into the REAL TuiEditor under a pty, screenshot
// the screen (marker shown), press Enter, and print the submit log.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Term } from '../test/vt100.mts'
const ESC = String.fromCharCode(27)
const CR = String.fromCharCode(13)
const NL = String.fromCharCode(10)
const LOG = '/tmp/longpaste.log'
try {
  fs.unlinkSync(LOG)
} catch {
  /* ignore */
}
const lines = Number(process.argv[2] || '25')
const body = Array.from(
  { length: lines },
  (_, i) => 'line ' + i + ' of the pasted block',
).join(NL)
const cols = Number(process.argv[3] || '80')
const rows = Number(process.argv[4] || '24')
const term = new Term(rows, cols)
const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-longpaste.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: String(cols),
      LINES: String(rows),
      PROBE_PASTE_LOG: LOG,
    },
  },
)
child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
child.stderr.on('data', (d) => term.write(d.toString('utf-8')))
setTimeout(() => {
  child.stdin.write(ESC + '[200~' + body + ESC + '[201~')
  setTimeout(() => {
    process.stdout.write('=== SCREEN (after paste) ===' + NL)
    process.stdout.write(term.render() + NL)
    child.stdin.write(CR)
    setTimeout(() => {
      process.stdout.write('=== LOG ===' + NL)
      try {
        process.stdout.write(fs.readFileSync(LOG, 'utf-8'))
      } catch {
        /* ignore */
      }
      child.kill('SIGTERM')
    }, 600)
  }, 600)
}, 5000)
child.on('close', () => process.exit(0))
