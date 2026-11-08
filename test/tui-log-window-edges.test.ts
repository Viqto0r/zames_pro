import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryRows, windowByRows, totalRows } from '../src/tui/log-window.ts'
import type { LogEntry } from '../src/tui/store.ts'

// Edge rules of the row-based log windowing: the viewport height and width
// come from a pty that may not be measured yet (NaN/0), the scroll may sit
// INSIDE one tall entry, and the width must come from the SHARED charWidth
// table (arrows and the hourglass are ONE cell, a CJK glyph is two).

const NL = String.fromCharCode(10)
const ESC = String.fromCharCode(27)
const e = (id: number, text: string): LogEntry => ({
  id,
  kind: 'system',
  text,
})

test('a non-finite width falls back to 80 columns', () => {
  assert.equal(entryRows(e(1, 'x'.repeat(160)), Number.NaN), 2)
  assert.equal(entryRows(e(1, 'x'.repeat(160)), 0), 2)
})

test('the floor mode under-estimates, the exact mode wraps up', () => {
  const entry = e(1, 'x'.repeat(90))
  assert.equal(entryRows(entry, 40, 'exact'), 3)
  assert.equal(entryRows(entry, 40, 'floor'), 2)
})

test('a narrow glyph counts one cell, a CJK glyph two', () => {
  // '→' (U+2192) and '⧗' (U+29D7) used to count as 2 cells.
  assert.equal(entryRows(e(1, '→'.repeat(40)), 40), 1)
  assert.equal(entryRows(e(1, '⧗'.repeat(40)), 40), 1)
  assert.equal(entryRows(e(1, '漢'.repeat(20)), 40), 1)
  assert.equal(entryRows(e(1, '漢'.repeat(21)), 40), 2)
})

test('an OSC-8 hyperlink does not inflate the row count', () => {
  const link =
    ESC +
    ']8;;https://example.com/a/very/long/url' +
    String.fromCharCode(7) +
    'label' +
    ESC +
    ']8;;' +
    String.fromCharCode(7)
  assert.equal(entryRows(e(1, link), 40), 1)
})

test('a non-finite or zero height keeps one row, not the whole log', () => {
  const list = [e(1, 'a'), e(2, 'b'), e(3, 'c')]
  assert.deepEqual(
    windowByRows(list, 0, 0, 40).map((x) => x.id),
    [3],
  )
  assert.equal(windowByRows(list, Number.NaN, 0, 40).length, 3)
})

test('scrolling inside a tall entry counts only its VISIBLE rows', () => {
  // One 10-row entry and a viewport of 4 rows: skipping 7 rows lands inside
  // it, so only 3 rows are visible and no other entry fits.
  const tall = e(1, Array.from({ length: 10 }, (_, i) => 'l' + i).join(NL))
  const w = windowByRows([tall], 4, 7, 40)
  assert.deepEqual(
    w.map((x) => x.id),
    [1],
  )
})

test('a scroll past the whole log yields an empty window', () => {
  const list = [e(1, 'a'), e(2, 'b')]
  assert.deepEqual(windowByRows(list, 5, 100, 40), [])
})

test('a negative or non-finite scroll is treated as zero', () => {
  const list = [e(1, 'a'), e(2, 'b')]
  assert.deepEqual(
    windowByRows(list, 5, -3, 40).map((x) => x.id),
    [1, 2],
  )
  assert.deepEqual(
    windowByRows(list, 5, Number.NaN, 40).map((x) => x.id),
    [1, 2],
  )
})

test('totalRows in floor mode never exceeds the exact total', () => {
  const list = [e(1, 'x'.repeat(90)), e(2, 'a' + NL + 'b')]
  assert.ok(totalRows(list, 40, 'floor') <= totalRows(list, 40, 'exact'))
})
