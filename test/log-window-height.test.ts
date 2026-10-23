import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryRows, windowByRows, totalRows } from '../src/tui/log-window.js'
import type { LogEntry } from '../src/tui/store.js'

const W = 10
function rows(n: number): LogEntry {
  return { kind: 'system', text: 'x'.repeat(n * W) } as LogEntry
}
function rowsof(list: LogEntry[]): number {
  return list.reduce((n, x) => n + entryRows(x, W), 0)
}

test('never picks more rows than the viewport height', () => {
  const all = [rows(1), rows(1), rows(1), rows(1), rows(1)]
  assert.equal(totalRows(all, W), 5)
  for (const h of [1, 2, 3, 5, 8]) {
    assert.ok(rowsof(windowByRows(all, h, 0, W)) <= h, 'h=' + h)
  }
})

// THE REAL BUG (this test is RED on the old code): the old check counted the
// FULL height of a tall entry and demanded a free row (`picked.length > 0`),
// so scrolling INSIDE one returned NOTHING and the pane went blank while the
// operator scrolled a long answer. The pane clips a tall entry to its tail.
test('scrolling inside a tall entry never blanks the pane', () => {
  const all = [rows(10)]
  for (let scroll = 0; scroll < 10; scroll++) {
    const visible = windowByRows(all, 4, scroll, W)
    assert.equal(
      visible.length,
      1,
      'scroll=' + scroll + ' produced a blank pane',
    )
  }
})

test('a tall entry above a short one does not swallow it', () => {
  // Newest entry: 1 row at the bottom; above it a 10-row one. With a 4-row
  // viewport both must be kept (the tall one is clipped by the pane).
  const all = [rows(10), rows(1)]
  const visible = windowByRows(all, 4, 0, W)
  assert.equal(visible.length, 2)
  assert.equal(entryRows(visible[1], W), 1)
})

test('a partially visible tall entry leaves room for a short one above', () => {
  // 20 rows with 19 scrolled away: only ONE row of the tall entry is still
  // visible, so the 1-row entry ABOVE it must also be rendered — the old
  // check counted the FULL 20 rows against the budget and dropped it.
  const all = [rows(1), rows(20)]
  const visible = windowByRows(all, 4, 19, W)
  assert.equal(visible.length, 2)
  assert.equal(entryRows(visible[0], W), 1)
})

test('totalRows floor vs exact differ for a partial last row', () => {
  const one = [{ kind: 'system', text: 'x'.repeat(25) } as LogEntry]
  assert.equal(totalRows(one, W, 'exact'), 3)
  assert.equal(totalRows(one, W, 'floor'), 2)
})

test('an empty log renders nothing', () => {
  assert.deepEqual(windowByRows([], 5, 0, W), [])
  assert.equal(totalRows([], W), 0)
})

test('a zero or negative height is clamped, not a crash', () => {
  const all = [rows(1), rows(1)]
  assert.equal(windowByRows(all, 0, 0, W).length, 1)
  assert.equal(windowByRows(all, -3, 0, W).length, 1)
})
