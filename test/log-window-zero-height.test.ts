import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowByRows } from '../src/tui/log-window.ts'
import type { LogEntry } from '../src/tui/store.ts'

// `fullScreenLayout` derives the log pane height from the terminal rows and the
// panel rows. A degenerate terminal (rows reported as 0 by a pty that has not
// been sized yet, or a layout that computed 0/negative) reached
// `windowByRows` and the budget check `used + visibleRows > 0` never fired —
// the WHOLE log was returned. Ink then clipped it inside the fixed-height pane,
// so the viewport silently stopped honouring the scroll offset.
//
// A pane with no room must return ONE entry (the pane keeps its last row), not
// the entire scrollback.

const rows: LogEntry[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  kind: 'system',
  text: 'row' + i,
  raw: false,
}))

test('a zero-height pane does not return the whole log', () => {
  const picked = windowByRows(rows, 0, 0, 80)
  assert.ok(
    picked.length < rows.length,
    'height 0 returned ' + picked.length + ' entries',
  )
})

test('a negative height is clamped like zero', () => {
  const picked = windowByRows(rows, -7, 0, 80)
  assert.ok(picked.length < rows.length, 'picked ' + picked.length)
})

test('a one-row pane still shows exactly the newest row', () => {
  assert.deepEqual(
    windowByRows(rows, 1, 0, 80).map((e) => e.text),
    ['row19'],
  )
})
