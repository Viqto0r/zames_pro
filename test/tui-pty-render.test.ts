// REAL-SCREEN geometry check for the full-screen TUI: runs the probe app
// (scripts/tui-probe.tsx) inside a pty and replays the terminal output through
// a VT100 emulator, then asserts the INPUT BOX rows — the bug this guards
// against (a logical-line-count height) is invisible to a pure layout test
// because it only shows on the assembled screen.
//
// OPT-IN: a pty run spawns `npx tsx` (~5s) and needs the `script` utility, so
// it is skipped unless ZAMES_PTY_TESTS=1. Run it before a release and after
// touching FullScreenApp / InputLine geometry:
//   ZAMES_PTY_TESTS=1 npx tsx --test test/tui-pty-render.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { Term } from './vt100.mjs'

const NL = String.fromCharCode(10)
const ROWS = 24
const COLS = 80
const enabled = process.env.ZAMES_PTY_TESTS === '1'
const hasScript = spawnSync('sh', ['-c', 'command -v script']).status === 0

function runProbe(buf: string, keys: string[], delayMs = 250): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(
      'script',
      ['-qec', 'npx tsx scripts/tui-probe.tsx ' + JSON.stringify(buf), '/dev/null'],
      { cwd: path.resolve('.'), env: { ...process.env, COLUMNS: String(COLS), LINES: String(ROWS) } },
    )
    let out = ''
    child.stdout.on('data', (d) => {
      out += d.toString('utf-8')
    })
    child.stderr.on('data', (d) => {
      out += d.toString('utf-8')
    })
    let i = 0
    const next = (): void => {
      if (i < keys.length) {
        child.stdin.write(keys[i])
        i++
        setTimeout(next, delayMs)
      } else {
        setTimeout(() => child.kill('SIGTERM'), 400)
      }
    }
    setTimeout(next, 4500)
    child.on('close', () => resolve(out))
  })
}

/** Replay the pty output, dropping `script`'s own kill banner (it overwrites
 *  the last row and would corrupt the geometry assertion). */
function screen(out: string): Term {
  const idx = out.indexOf('Session terminated')
  const term = new Term(ROWS, COLS)
  term.write(idx >= 0 ? out.slice(0, idx) : out)
  return term
}

const run = enabled && hasScript ? test : test.skip

run('pty: a long single line renders ONE box row count = visual rows', async () => {
  const long = 'x'.repeat(200)
  const out = await runProbe(long, [])
  const term = screen(out)
  // Find the rounded border rows of the input box.
  const top = term.findRow('╭')
  const bottom = term.findRow('╰')
  assert.ok(top >= 0 && bottom > top, 'the input box borders must be on screen')
  // 2 borders + >= 3 wrapped text rows (200 chars at inner width 76).
  assert.ok(
    bottom - top + 1 >= 5,
    'the box must GROW for a wrapped line (got ' + (bottom - top + 1) + ' rows)',
  )
})

run('pty: Ctrl+J (LF) inserts newlines and the box grows per line', async () => {
  const keys = ['a', NL, 'b', NL, 'c']
  const out = await runProbe('', keys)
  const term = screen(out)
  const top = term.findRow('╭')
  const bottom = term.findRow('╰')
  assert.ok(top >= 0 && bottom > top)
  // 2 borders + 3 typed lines.
  assert.equal(bottom - top + 1, 5)
  // Each line is on its OWN row (the old bug printed line 2 over line 1).
  assert.ok(term.findRow('> a') >= 0, 'line a must be visible')
  assert.ok(term.findRow('  b') >= 0, 'line b must be on its own row')
  assert.ok(term.findRow('  c') >= 0, 'line c must be on its own row')
})
