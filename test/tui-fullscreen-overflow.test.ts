import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fullScreenLayout } from '../src/tui/layout.ts'

// The full-screen layout must FIT the terminal: the whole point of computing
// `panelRows` and `logHeight` in one place is that the header, the log, the
// status, the input box, the suggestion popup and the hint add up to exactly
// `termRows`. A project with MANY custom commands opens a tall popup, and the
// layout then reserved `logHeight: 1` and let the panel overflow: the input
// rows were pushed below the terminal and the caret drifted under the box.

function totalRows(r: ReturnType<typeof fullScreenLayout>): number {
  return (
    r.headerRows +
    r.logHeight +
    r.statusRows +
    r.inputBoxRows +
    r.suggestRows +
    r.hintRows
  )
}

test('a tall suggestion popup never overflows the terminal', () => {
  const r = fullScreenLayout({
    termRows: 24,
    cols: 80,
    prompt: '>',
    buf: '',
    cursor: 0,
    suggestRows: 40,
  })
  assert.ok(
    totalRows(r) <= 24,
    'the layout needs ' + totalRows(r) + ' rows on a 24-row terminal',
  )
})

test('a small popup keeps the log usable and the sum exact', () => {
  const r = fullScreenLayout({
    termRows: 24,
    cols: 80,
    prompt: '>',
    buf: '',
    cursor: 0,
    suggestRows: 6,
  })
  assert.ok(totalRows(r) <= 24, 'overflows: ' + totalRows(r))
  assert.ok(r.logHeight >= 1)
})
