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
import fs from 'node:fs'
import path from 'node:path'
import { Term } from './vt100.mjs'

const NL = String.fromCharCode(10)
const ROWS = 24
const COLS = 80
const enabled = process.env.ZAMES_PTY_TESTS === '1'
const hasScript = spawnSync('sh', ['-c', 'command -v script']).status === 0

function runProbe(
  buf: string,
  keys: string[],
  delayMs = 250,
  copyLog?: string,
  inline = false,
  probe = 'tui-probe',
  cols = COLS,
  rows = ROWS,
): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(
      'script',
      [
        '-qec',
        'npx tsx scripts/' + probe + '.tsx ' + JSON.stringify(buf),
        '/dev/null',
      ],
      {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          COLUMNS: String(cols),
          LINES: String(rows),
          ...(copyLog ? { PROBE_COPY_LOG: copyLog } : {}),
          ...(inline ? { PROBE_INLINE: '1' } : {}),
        },
      },
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

run(
  'pty: a long single line renders ONE box row count = visual rows',
  async () => {
    const long = 'x'.repeat(200)
    const out = await runProbe(long, [])
    const term = screen(out)
    // Find the rounded border rows of the input box.
    const top = term.findRow('╭')
    const bottom = term.findRow('╰')
    assert.ok(
      top >= 0 && bottom > top,
      'the input box borders must be on screen',
    )
    // 2 borders + >= 3 wrapped text rows (200 chars at inner width 76).
    assert.ok(
      bottom - top + 1 >= 5,
      'the box must GROW for a wrapped line (got ' +
        (bottom - top + 1) +
        ' rows)',
    )
  },
)

run(
  'pty: Ctrl+J (LF) inserts newlines and the box grows per line',
  async () => {
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
  },
)

run('pty: Ctrl+Y fires the code-copy callback', async () => {
  const copyLog = path.join(process.cwd(), 'tmp', 'probe-copy.log')
  try {
    fs.unlinkSync(copyLog)
  } catch {
    /* ignore */
  }
  // Ctrl+Y = 0x19.
  const out = await runProbe('', ['\u0019'], 400, copyLog)
  void out
  let hits = ''
  try {
    hits = fs.readFileSync(copyLog, 'utf-8')
  } catch {
    /* ignore */
  }
  assert.ok(hits.includes('copy'), 'Ctrl+Y must invoke onCopyCode')
})

run('pty: INLINE mode renders the input and accepts a newline', async () => {
  // Inline mode does not use the alternate screen; the input box still grows
  // with a multi-line buffer and the Ctrl+J newline must appear.
  const out = await runProbe('', ['a', NL, 'b'], 350, undefined, true)
  const term = screen(out)
  assert.ok(term.findRow('> a') >= 0, 'inline: first line must be visible')
  assert.ok(
    term.findRow('  b') >= 0,
    'inline: second line must be on its own row',
  )
})

run(
  'pty: a LONG workdir at a narrow terminal does not clip the input box',
  async () => {
    // The live bug: the header title row WRAPPED because the workdir was not
    // truncated, the fixed-height column overflowed and the first input row
    // was pushed off the top (the operator saw line 2 overprint line 1).
    // tui-repro uses the real prompt, a long workdir and command list.
    const out = await runProbe(
      '',
      ['a', NL, 'b', NL, 'c'],
      250,
      undefined,
      false,
      'tui-repro',
      40,
      15,
    )
    const term = screen(out)
    const top = term.findRow('╭')
    const bottom = term.findRow('╰')
    assert.ok(top >= 0 && bottom > top, 'the input box must be on screen')
    // 2 borders + 3 typed lines, all THREE visible (nothing scrolled off).
    assert.equal(bottom - top + 1, 5)
    assert.ok(term.findRow('a') >= 0, 'line a must be visible')
    assert.ok(term.findRow('b') >= 0, 'line b must be visible')
    assert.ok(term.findRow('c') >= 0, 'line c must be visible')
  },
)

run('pty: a large bracketed paste reaches onSubmit EXPANDED', async () => {
  // The operator pasted 25 lines and the agent got only '[Pasted lines#25]'.
  // tui-pastetest sends a real bracketed paste to tui-submit (which logs what
  // onSubmit received) and prints the log: the marker must NOT be there.
  const out = await new Promise<string>((resolve) => {
    const child = spawn('npx', ['tsx', 'scripts/tui-pastetest.mts'], {
      cwd: path.resolve('.'),
      env: { ...process.env, COLUMNS: '80', LINES: '24' },
    })
    let o = ''
    child.stdout.on('data', (d) => (o += d.toString('utf-8')))
    child.stderr.on('data', (d) => (o += d.toString('utf-8')))
    child.on('close', () => resolve(o))
  })
  assert.ok(
    out.includes('SUBMIT="l1\\nl2\\nl3\\nl4\\nl5"'),
    'onSubmit must receive the FULL pasted text, got: ' + out.trim(),
  )
  assert.ok(
    !out.includes('SUBMIT="[Pasted lines#5]"'),
    'the literal [Pasted lines#N] marker must never reach the agent',
  )
})

run(
  'pty: the config menu redraws a changed value and fits the screen',
  async () => {
    // Two live bugs in /config: (1) toggling/cycling changed the config but the
    // row kept the OLD value (React had no state to react to), (2) the windowed
    // list ignored group-header rows, so the block overflowed and the title
    // scrolled off. The probe mounts the REAL menu with the REAL schema.
    const out = await new Promise<string>((resolve) => {
      const child = spawn(
        'npx',
        [
          'tsx',
          'scripts/tui-config-driver.mts',
          '--cols=90',
          '--rows=30',
          '--keys=RIGHT',
        ],
        { cwd: path.resolve('.'), env: { ...process.env } },
      )
      let o = ''
      child.stdout.on('data', (d) => (o += d.toString('utf-8')))
      child.stderr.on('data', (d) => (o += d.toString('utf-8')))
      child.on('close', () => resolve(o))
    })
    const screenPart = out.split('===LOG===')[0]
    const logPart = out.split('===LOG===')[1] || ''
    // The mutation reached the config...
    assert.ok(
      logPart.includes('SET ui.locale="en"'),
      'the menu must apply the change, got: ' + logPart.trim(),
    )
    // ...AND the row now SHOWS the new value (the stale-render bug).
    assert.ok(
      screenPart.includes('‹ en ›'),
      'the row must re-render with the new value, got:' + screenPart,
    )
    // The title (top border) is on screen — the block does not overflow.
    assert.ok(
      screenPart.includes('Настройки'),
      'the menu title must stay on screen, got:' + screenPart,
    )
  },
)

run('pty: the mouse mode is written ONCE, not per render', async () => {
  // The wheel-vs-history bug kept coming back: useMouseWheel listed `onWheel`
  // (an inline arrow) in its effect deps, so the effect re-ran on EVERY render
  // and each cleanup wrote 1007h (alternate-scroll ON => wheel becomes an
  // ARROW => input history). This pins that the mode bytes are written once
  // even while the store ticks (the badge timer does this in the live app).
  const out = await new Promise<string>((resolve) => {
    const child = spawn('npx', ['tsx', 'scripts/mouse-churn.mts'], {
      cwd: path.resolve('.'),
    })
    let o = ''
    child.stdout.on('data', (d) => (o += d.toString('utf-8')))
    child.stderr.on('data', (d) => (o += d.toString('utf-8')))
    child.on('close', () => resolve(o))
  })
  assert.ok(
    out.includes('MOUSE_CHURN_OK'),
    'the mouse mode must be written once, got:' + out,
  )
})

run('pty: the caret lands correctly in a CJK buffer (wide chars)', async () => {
  // The cursor column was computed by re-measuring the row text up to
  // `cursorCol` CODE POINTS, which double-counted wide chars: with a CJK
  // buffer the caret jumped to the line end. `cursorCol` is already a column
  // count, so the terminal column is just 2 + cursorCol.
  const buf = '中文テスト日本語テキスト'
  const out = await new Promise<string>((resolve) => {
    const child = spawn(
      'npx',
      [
        'tsx',
        'scripts/tui-input-driver.mts',
        '--cols=80',
        '--rows=20',
        '--buf=' + buf,
        '--cursor=6',
      ],
      { cwd: path.resolve('.') },
    )
    let o = ''
    child.stdout.on('data', (d) => (o += d.toString('utf-8')))
    child.stderr.on('data', (d) => (o += d.toString('utf-8')))
    child.on('close', () => resolve(o))
  })
  // prompt visLen = 10, cursor after 6 wide chars = 12 cols, border = 2.
  assert.ok(
    out.includes('CURSOR row=18 col=24'),
    'the CJK caret must be at column 24, got:' + out,
  )
})
