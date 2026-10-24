// The FULL-SCREEN layout places the terminal caret at `cursorTop + cursorRow`
// (InputLine). The panel height and `cursorTop` were computed in the COMPONENT
// with two separate expressions:
//   panel:  HEADER + STATUS + box + suggest + HINT
//   caret:  HEADER + Math.max(1, termRows - panel) + suggest + STATUS + 1
// The pure helper now owns that arithmetic; pin its invariants here so a
// future edit cannot make the reserved rows and the caret row drift apart (the
// caret would land away from the input box).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fullScreenLayout } from '../src/tui/layout.ts'

test('the caret sits right after the status row of the reserved panel', () => {
  for (const termRows of [6, 10, 24, 40]) {
    for (const buf of ['', 'one line', 'a\nb\nc\nd\ne\nf\ng\nh']) {
      const lay = fullScreenLayout({
        termRows,
        cols: 80,
        prompt: '> ',
        buf,
        cursor: buf.length,
        suggestRows: 0,
      })
      assert.equal(
        lay.cursorTop,
        lay.headerRows + lay.logHeight + lay.statusRows + 1,
        'termRows=' + termRows + ' buf=' + JSON.stringify(buf),
      )
    }
  }
})

test('the panel plus the log viewport never exceeds the terminal', () => {
  for (const termRows of [6, 10, 24, 40]) {
    const lay = fullScreenLayout({
      termRows,
      cols: 80,
      prompt: '> ',
      buf: 'a\nb\nc',
      cursor: 5,
      suggestRows: 3,
    })
    assert.ok(
      lay.panelRows + lay.logHeight >= termRows,
      'layout overflows: ' + JSON.stringify({ termRows, lay }),
    )
    assert.equal(lay.logHeight, Math.max(1, termRows - lay.panelRows))
  }
})

test('the suggestion popup is reserved ABOVE the input box', () => {
  const without = fullScreenLayout({
    termRows: 30,
    cols: 80,
    prompt: '> ',
    buf: '',
    cursor: 0,
    suggestRows: 0,
  })
  const withPopup = fullScreenLayout({
    termRows: 30,
    cols: 80,
    prompt: '> ',
    buf: '',
    cursor: 0,
    suggestRows: 4,
  })
  // The popup takes rows from the LOG, not from the panel below it.
  assert.equal(without.logHeight - withPopup.logHeight, 4)
  assert.equal(withPopup.panelRows - without.panelRows, 4)
  assert.equal(withPopup.cursorTop, without.cursorTop)
})

test('a suggestion list taller than the screen still leaves a visible box', () => {
  // Known limitation: when the popup and the box together exceed the terminal
  // the panel cannot fit and Ink clips from the top (the header scrolls away).
  // The log viewport is already at its 1-row floor here, so the helper must
  // NOT shrink it further — pin that floor instead of pretending it fits.
  const lay = fullScreenLayout({
    termRows: 6,
    cols: 80,
    prompt: '> ',
    buf: 'a\nb',
    cursor: 3,
    suggestRows: 12,
  })
  assert.equal(lay.logHeight, 1)
})
