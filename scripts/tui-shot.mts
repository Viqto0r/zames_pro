// Take a VT100 "screenshot" of the TUI under a pty and print the grid.
//
// Usage: npx tsx scripts/tui-shot.mts [--inline] [--probe=tui-repro|tui-probe]
//        [--buf=<initial buffer>] [--keys=a,LF,b,ENTER] [--cols=80] [--rows=24]
//
// Keys are sent ONE CHUNK AT A TIME. Tokens: LF (Ctrl+J newline), CR (Enter),
// ESC, TAB, or any literal character. The screen is snapshotted WHILE the app
// is still alive, so the real terminal-cursor cell is included.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { Term } from '../test/vt100.mts'

const ESC = String.fromCharCode(27)
const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const TAB = String.fromCharCode(9)

function arg(name: string, def = ''): string {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3) : def
}
const hasFlag = (name: string): boolean => process.argv.includes('--' + name)

const inline = hasFlag('inline')
const probe = arg('probe', 'tui-repro')
const buf = arg('buf', '')
const keys = arg('keys', '')
  .split(',')
  .filter((s) => s.length > 0)
  .map((s) => {
    if (s === 'LF') return LF
    if (s === 'CR' || s === 'ENTER') return CR
    if (s === 'ESC') return ESC
    if (s === 'TAB') return TAB
    // Alt+Enter and Shift+Enter must arrive as ONE chunk, like a real terminal
    // sends them; splitting them into separate chunks makes Ink read a bare
    // Escape key instead of the modified Enter.
    if (s === 'ALTENTER') return ESC + CR
    if (s === 'SHIFTENTER') return ESC + '[13;2u'
    if (s === 'UP') return ESC + '[A'
    if (s === 'DOWN') return ESC + '[B'
    if (s === 'RIGHT') return ESC + '[C'
    if (s === 'LEFT') return ESC + '[D'
    // Editing keys, so the word-delete bindings can be exercised on a real pty.
    if (s === 'CTDL') return ESC + '[3;5~' // Ctrl+Delete (xterm)
    if (s === 'CTDLU') return ESC + '[3;5u' // Ctrl+Delete (kitty CSI-u)
    if (s === 'CTRLBS') return ESC + String.fromCharCode(127) // Ctrl+Backspace
    if (s === 'CTB08') return String.fromCharCode(8) // Ctrl+Backspace (0x08)
    if (s === 'DEL') return ESC + '[3~' // Delete
    if (s === 'CTRLW') return String.fromCharCode(23)
    if (s === 'CTRLU') return String.fromCharCode(21)
    if (s === 'CTRLK') return String.fromCharCode(11)
    if (s === 'SPACE') return ' '
    return s
  })
const cols = Number(arg('cols', '80'))
const rows = Number(arg('rows', '24'))
const hold = Number(arg('hold', '500'))

const scriptPath = 'npx tsx scripts/' + probe + '.tsx ' + JSON.stringify(buf)

const term = new Term(rows, cols)
const child = spawn('script', ['-qec', scriptPath, '/dev/null'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env,
    COLUMNS: String(cols),
    LINES: String(rows),
    ...(inline ? { PROBE_INLINE: '1' } : {}),
  },
})
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
      const cr = term.r
      const cc = term.c
      const lines = term.render().split(LF)
      if (lines[cr])
        lines[cr] =
          lines[cr].slice(0, cc) +
          String.fromCharCode(9673) +
          lines[cr].slice(cc + 1)
      process.stdout.write(
        lines.map((l, n) => String(n).padStart(2) + '| ' + l).join(LF) +
          LF +
          'cursor: row ' +
          cr +
          ', col ' +
          cc +
          LF,
      )
      child.kill('SIGTERM')
    }, hold)
  }
}
setTimeout(tick, 4500)
child.on('close', () => process.exit(0))
