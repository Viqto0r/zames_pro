import test from 'node:test'
import assert from 'node:assert/strict'
import { entryRows } from '../src/tui/log-window.ts'

// `entryRows` estimates how many ROWS a log entry occupies, and the full-screen
// layout reserves the panel height from that estimate. Its width table only
// knew emoji and CJK as wide; everything in the CJK-adjacent ranges was counted
// as TWO cells, so a line built from symbols the real terminal draws in ONE
// cell (a box arrow `→`, the hourglass `⧗` the status line itself uses) was
// over-estimated. At a narrow width the over-estimate reserves an extra row
// per entry, the pane believes it is full and the log stops scrolling where it
// should not.
//
// The comparison is against `visLen` — the SAME width rule the input/status
// layout uses — so both halves of the TUI agree on what is wide.
test('an arrow counts as ONE cell, like the input layout counts it', async () => {
  const { visLen } = await import('../src/input/layout.ts')
  assert.equal(visLen('→'), 1, 'sanity: visLen treats the arrow as narrow')
  // At width 1 a one-cell char takes ONE row.
  assert.equal(entryRows({ text: '→' } as never, 1), 1)
})

test('the hourglass used in the status line is narrow too', async () => {
  const { visLen } = await import('../src/input/layout.ts')
  assert.equal(visLen('⧗'), 1)
  assert.equal(entryRows({ text: '⧗' } as never, 1), 1)
})

test('a real CJK char still takes two cells', () => {
  assert.equal(entryRows({ text: '漢' } as never, 1), 2)
})

test('an emoji still takes two cells', () => {
  assert.equal(entryRows({ text: '😀' } as never, 1), 2)
})
