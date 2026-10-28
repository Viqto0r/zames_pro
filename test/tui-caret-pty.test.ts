import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { Term } from './vt100.mjs'

// The caret is a TERMINAL CURSOR positioned by absolute row/col — a pure
// arithmetic test cannot see whether the number matches what Ink actually drew.
// This runs the REAL FullScreenApp (scripts/tui-probe.tsx) inside a pty, types
// `/chats` so the suggestion popup opens, and asserts the cursor row is the
// INPUT TEXT row, not the popup and not the border.
//
// OPT-IN (spawns `npx tsx` and needs `script`):
//   ZAMES_PTY_TESTS=1 npx tsx --test test/tui-caret-pty.test.ts
const enabled = process.env.ZAMES_PTY_TESTS === '1'
const hasScript = spawnSync('sh', ['-c', 'command -v script']).status === 0

function runCaretProbe(): Promise<{ rows: string[]; cursorRow: number }> {
  return new Promise((resolve) => {
    const term = new Term(30, 100)
    const child = spawn(
      'script',
      ['-qec', 'npx tsx scripts/tui-probe.tsx ""', '/dev/null'],
      {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          COLUMNS: '100',
          LINES: '30',
          PROBE_MOUSE: '1',
          ZAMES_TMP_DIR: '/tmp/zames-probe-tmp',
        },
      },
    )
    child.stdout.on('data', (d) => term.write(d.toString('utf-8')))
    child.stderr.on('data', (d) => term.write(d.toString('utf-8')))
    setTimeout(() => child.stdin.write('/chats'), 2500)
    setTimeout(() => {
      const rows = term.grid.map((r) => r.join('').replace(/\s+$/, ''))
      const cursorRow = term.r
      child.kill('SIGKILL')
      resolve({ rows, cursorRow })
    }, 6000)
  })
}

test(
  'the caret sits on the input TEXT row while the popup is open',
  { skip: !enabled || !hasScript },
  async () => {
    const { rows, cursorRow } = await runCaretProbe()
    const popupRow = rows.findIndex((r) => r.includes('the chat list'))
    const boxTop = rows.findIndex((r) => r.includes('╭'))
    const textRow = rows.findIndex((r) => r.includes('│ > /chats'))
    assert.ok(popupRow > 0, 'the popup did not open:\n' + rows.join('\n'))
    assert.ok(boxTop > popupRow, 'the popup must sit ABOVE the box')
    assert.ok(textRow > boxTop, 'the box text row is missing')
    assert.equal(
      cursorRow,
      textRow,
      'the caret must be on the input TEXT row (' +
        textRow +
        '), got ' +
        cursorRow +
        '\n' +
        rows.join('\n'),
    )
  },
)
