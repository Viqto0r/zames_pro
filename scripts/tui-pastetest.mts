// Reproduce the [Pasted lines#N] path end to end under a pty: send ONE
// bracketed-paste chunk with several lines, press Enter, and print what the
// onSubmit callback actually received (that is what reaches the agent).
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const ESC = String.fromCharCode(27)
const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const LOG = '/tmp/paste-submit.log'
fs.writeFileSync(LOG, '')

const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-submit.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: { ...process.env, COLUMNS: '80', LINES: '24', PROBE_SUBMIT_LOG: LOG },
  },
)
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})

setTimeout(() => {
  const paste =
    ESC + '[200~' + ['l1', 'l2', 'l3', 'l4', 'l5'].join(LF) + ESC + '[201~'
  child.stdin.write(paste)
  setTimeout(() => {
    child.stdin.write(CR)
    setTimeout(() => child.kill('SIGTERM'), 800)
  }, 800)
}, 4500)

child.on('close', () => {
  process.stdout.write(fs.readFileSync(LOG, 'utf-8'))
  process.exit(0)
})
