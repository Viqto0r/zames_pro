// Unit tests for the PURE row-based log windowing (src/tui/log-window.ts).
// The full-screen viewport slices by RENDERED ROWS so a long wrapped answer
// cannot overflow the panel; these tests pin that behavior.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  entryRows,
  windowByRows,
  totalRows,
} from '../src/tui/log-window.ts'
import type { LogEntry } from '../src/tui/store.ts'

function e(id: number, text: string): LogEntry {
  return { id, kind: 'system', text }
}

const NL = String.fromCharCode(10)

test('entryRows: a short line is one row', () => {
  assert.equal(entryRows(e(1, 'hello'), 40), 1)
})

test('entryRows: explicit newlines add rows', () => {
  assert.equal(entryRows(e(1, 'a' + NL + 'b' + NL + 'c'), 40), 3)
})

test('entryRows: a long line wraps by width', () => {
  assert.equal(entryRows(e(1, 'x'.repeat(90)), 40), 3) // 40+40+10
  assert.equal(entryRows(e(1, 'x'.repeat(80)), 40), 2)
})

test('entryRows: ANSI escapes do not count toward the width', () => {
  const esc = String.fromCharCode(27)
  const colored = esc + '[31m' + 'x'.repeat(80) + esc + '[0m'
  assert.equal(entryRows(e(1, colored), 40), 2)
})

test('entryRows: an empty entry is still one row', () => {
  assert.equal(entryRows(e(1, ''), 40), 1)
})

test('totalRows: sums per-entry heights', () => {
  const list = [e(1, 'a'), e(2, 'b' + NL + 'c'), e(3, 'x'.repeat(40))]
  assert.equal(totalRows(list, 40), 1 + 2 + 1)
})

test('windowByRows: fits the height and keeps the newest', () => {
  const list = [e(1, 'one'), e(2, 'two'), e(3, 'three')]
  const w = windowByRows(list, 2, 0, 40)
  assert.deepEqual(
    w.map((x) => x.id),
    [2, 3],
  )
})

test('windowByRows: a long answer is kept and its tail shown', () => {
  // One entry taller than the viewport must not be dropped (that was the
  // "empty screen with a long answer" artifact).
  const list = [e(1, 'x'.repeat(200)), e(2, 'tail')]
  const w = windowByRows(list, 3, 0, 40)
  assert.ok(w.length >= 1)
  assert.equal(w[w.length - 1].id, 2)
})

test('windowByRows: scroll skips rows from the bottom', () => {
  const list = [e(1, 'a'), e(2, 'b'), e(3, 'c')]
  const w = windowByRows(list, 2, 1, 40)
  // One row hidden from the bottom -> the window shows 1 and 2.
  assert.deepEqual(
    w.map((x) => x.id),
    [1, 2],
  )
})

test('windowByRows: an empty list yields an empty window', () => {
  assert.deepEqual(windowByRows([], 5, 0, 40), [])
})
