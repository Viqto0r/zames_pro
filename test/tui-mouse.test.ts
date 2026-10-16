// Unit tests for the mouse-wheel SGR parser (src/tui/useMouseWheel.ts).
// Ink does not parse mouse events, so this parser is the only thing that turns
// the raw terminal bytes into a scroll delta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseWheel,
  incompleteTail,
  mouseModeSequences,
} from '../src/tui/useMouseWheel.ts'
import { DEFAULTS } from '../src/config.ts'

const ESC = String.fromCharCode(27)

// SGR: ESC [ < Cb ; Cx ; Cy M|m
function sgr(cb: number, x = 10, y = 10): string {
  return ESC + '[<' + cb + ';' + x + ';' + y + 'M'
}

test('parseWheel: wheel up = +1, wheel down = -1', () => {
  assert.equal(parseWheel(sgr(64)), 1)
  assert.equal(parseWheel(sgr(65)), -1)
})

test('parseWheel: no wheel = 0', () => {
  assert.equal(parseWheel('plain text'), 0)
  assert.equal(parseWheel(sgr(0)), 0) // left click, not a wheel
  assert.equal(parseWheel(''), 0)
})

test('parseWheel: several events in one chunk accumulate', () => {
  assert.equal(parseWheel(sgr(64) + sgr(64) + sgr(65)), 1)
  assert.equal(parseWheel(sgr(65) + sgr(65)), -2)
})

test('parseWheel: ignores modifier bits (shift/ctrl wheel)', () => {
  // Shift-wheel = Cb 68 (64 | 4), Ctrl-wheel = 80 (64 | 16).
  assert.equal(parseWheel(sgr(68)), 1)
  assert.equal(parseWheel(sgr(80)), 1)
})

test('incompleteTail: a clean chunk has no tail', () => {
  assert.equal(incompleteTail(sgr(64)), '')
  assert.equal(incompleteTail('plain'), '')
  assert.equal(incompleteTail(''), '')
})

test('incompleteTail: a split sequence is returned to carry', () => {
  // The terminal cut ESC[<64;10;1 before the M terminator.
  const head = ESC + '[<64;10;1'
  assert.equal(incompleteTail(head), head)
  // And the reassembled pair parses to one notch.
  assert.equal(parseWheel(head + 'M'), 1)
})

test('incompleteTail: a trailing incomplete sequence after a complete one', () => {
  const buf = sgr(64) + ESC + '[<65;1'
  assert.equal(incompleteTail(buf), ESC + '[<65;1')
})

test('mouseModeSequences(SCROLL): reporting BEFORE alternate-scroll off', () => {
  const { on, off } = mouseModeSequences(true)
  // 1000h + 1006h must precede 1007l: some terminals only apply 1007 while
  // mouse reporting is on, and sending 1007l alone left the wheel as arrows.
  const i1000 = on.indexOf(ESC + '[?1000h')
  const i1006 = on.indexOf(ESC + '[?1006h')
  const i1007 = on.indexOf(ESC + '[?1007l')
  assert.ok(i1000 >= 0 && i1006 >= 0 && i1007 >= 0)
  assert.ok(i1000 < i1007, '1000h must come before 1007l')
  assert.ok(i1006 < i1007, '1006h must come before 1007l')
  // Unmount restores the terminal (reporting off, alternate-scroll back on).
  assert.ok(off.includes(ESC + '[?1006l'))
  assert.ok(off.includes(ESC + '[?1000l'))
  assert.ok(off.includes(ESC + '[?1007h'))
})

test('mouseModeSequences(SELECT): reporting OFF in the steady state', () => {
  const { on, off } = mouseModeSequences(false)
  // The steady SELECT state must NOT leave reporting enabled: native
  // drag-select only works when 1000/1006 are off. The one-time primer still
  // applies 1007l, so the reported wheel stays inert (no arrows -> no history).
  assert.ok(on.includes(ESC + '[?1007l'))
  assert.ok(
    on.endsWith(ESC + '[?1006l' + ESC + '[?1000l'),
    'reporting must be turned back off after the 1007 primer',
  )
  assert.ok(
    !on.slice(-(ESC + '[?1006l' + ESC + '[?1000l').length).includes('h'),
  )
  assert.ok(off.includes(ESC + '[?1006l'))
  assert.ok(off.includes(ESC + '[?1000l'))
})

test('config: ui.mouseScroll defaults to SCROLL (the wheel scrolls the log)', () => {
  // The operator asked that the wheel scroll the DIALOG by default; that
  // needs mouse reporting ON (SCROLL), with drag-select on Shift. The default
  // is pinned here so a silent flip back to SELECT is caught.
  assert.equal(DEFAULTS.ui.mouseScroll, true)
})

test('parseWheel: SHIFT+wheel still scrolls (modifier is ignored)', () => {
  // Shift+wheel = Cb 68/69. The button mask drops the modifier bits, so
  // Shift+wheel scrolls the log just like a plain wheel — which is what lets
  // the operator select with Shift AND still scroll without releasing.
  assert.equal(parseWheel(sgr(68)), 1)
  assert.equal(parseWheel(sgr(69)), -1)
  // A burst of Shift+wheel then plain wheel accumulates in order.
  assert.equal(parseWheel(sgr(68) + sgr(68) + sgr(64)), 3)
})
