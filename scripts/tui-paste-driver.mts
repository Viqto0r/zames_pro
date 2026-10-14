// Feed a scripted set of bracketed pastes + Enter into the REAL TuiEditor
// probe under a pty, then print /tmp/paste-kinds.log (what onSubmit received).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ESC = String.fromCharCode(27)
const CR = String.fromCharCode(13)
const LOG = '/tmp/paste-kinds.log'
const TMP = '/tmp/paste-probe-tmp'
for (const f of [LOG]) {
  try {
    fs.unlinkSync(f)
  } catch {
    /* ignore */
  }
}
fs.mkdirSync(TMP, { recursive: true })

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const dataUrl = 'data:image/png;base64,' + png
const existingFile = path.resolve('README.md')

const pastes = [
  'hello plain text',
  'line1' +
    String.fromCharCode(10) +
    'line2' +
    String.fromCharCode(10) +
    'line3' +
    String.fromCharCode(10) +
    'line4',
  existingFile,
  dataUrl,
]

const child = spawn(
  'script',
  ['-qec', 'npx tsx scripts/tui-paste-kinds.tsx', '/dev/null'],
  {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      COLUMNS: '90',
      LINES: '28',
      PROBE_PASTE_LOG: LOG,
      PROBE_PASTE_TMP: TMP,
    },
  },
)
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})

const enc = (s: string): string => ESC + '[200~' + s + ESC + '[201~'
let i = 0
const step = (): void => {
  if (i < pastes.length) {
    child.stdin.write(enc(pastes[i]))
    setTimeout(() => {
      child.stdin.write(CR)
      i++
      setTimeout(step, 500)
    }, 500)
  } else {
    setTimeout(() => child.kill('SIGTERM'), 600)
  }
}
setTimeout(step, 5000)
child.on('close', () => {
  let out = ''
  try {
    out = fs.readFileSync(LOG, 'utf-8')
  } catch {
    out = '(no log)'
  }
  process.stdout.write(out + String.fromCharCode(10))
  try {
    process.stdout.write('--- tmp files ---' + String.fromCharCode(10))
    process.stdout.write(
      fs.readdirSync(TMP).join(String.fromCharCode(10)) +
        String.fromCharCode(10),
    )
  } catch {
    /* ignore */
  }
  process.exit(0)
})
