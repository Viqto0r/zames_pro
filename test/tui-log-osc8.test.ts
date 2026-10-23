import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryRows, windowByRows } from '../src/tui/log-window.ts'
import type { LogEntry } from '../src/tui/store.ts'

const ESC = String.fromCharCode(27)
const BS = String.fromCharCode(92)

const entry = (id: number, text: string): LogEntry =>
  ({ id, kind: 'system', text }) as LogEntry

// A markdown answer is stored as PRE-RENDERED ANSI (`raw: true`). With OSC-8
// hyperlinks a link is `ESC]8;;URL ESC\\LABEL ESC]8;; ESC\\` — a non-CSI
// sequence that `visWidth` does not strip: every URL character counted as a
// visible column. The full-screen viewport then believed a short line filled
// many rows (or a long line filled none), so the window showed the wrong slice
// and the log jumped while scrolling.
test('an OSC-8 hyperlink does not inflate the row count', () => {
  const link =
    ESC +
    ']8;;http://example.com/a/very/long/url' +
    ESC +
    BS +
    'click' +
    ESC +
    ']8;;' +
    ESC +
    BS
  assert.equal(entryRows(entry(1, link), 10), 1)
  // A plain ANSI color sequence still counts only its visible text.
  assert.equal(
    entryRows(entry(2, ESC + '[31m' + 'abcdefghij' + ESC + '[0m'), 5),
    2,
  )
})

test('the window keeps the newest entries with an OSC-8 link', () => {
  const link =
    ESC + ']8;;http://example.com/x' + ESC + BS + 'a' + ESC + ']8;;' + ESC + BS
  const entries = [entry(1, 'one'), entry(2, 'two'), entry(3, link)]
  assert.deepEqual(
    windowByRows(entries, 2, 0, 10).map((e) => e.id),
    [2, 3],
  )
})
