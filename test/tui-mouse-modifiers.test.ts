// SGR mouse decoding corner cases that make a wheel notch disappear or count
// twice (src/tui/useMouseWheel.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWheel } from '../src/tui/useMouseWheel.ts'

const ESC = String.fromCharCode(27)

function sgr(cb: number, terminator = 'M'): string {
  return ESC + '[<' + cb + ';10;10' + terminator
}

// Cb bits: 4 = shift, 8 = alt, 16 = ctrl. Wheel is button 64/65, so the
// modifier values are 68/76/84 (shift/alt/ctrl) and 69/77/85.

test('parseWheel: every modifier combination keeps the wheel direction', () => {
  assert.equal(parseWheel(sgr(68)), 1) // shift + up
  assert.equal(parseWheel(sgr(72)), 1) // alt + up
  assert.equal(parseWheel(sgr(80)), 1) // ctrl + up
  assert.equal(parseWheel(sgr(88)), 1) // ctrl + alt + up
  assert.equal(parseWheel(sgr(69)), -1) // shift + down
  assert.equal(parseWheel(sgr(73)), -1) // alt + down
  assert.equal(parseWheel(sgr(81)), -1) // ctrl + down
  assert.equal(parseWheel(sgr(85)), -1) // ctrl + alt + down
})

test('parseWheel: a RELEASE report is not a second wheel notch', () => {
  // Press + release of one wheel notch, as xterm sends with 1000/1002 mode.
  assert.equal(parseWheel(sgr(64, 'M') + sgr(64, 'm')), 1)
  assert.equal(parseWheel(sgr(65, 'M') + sgr(65, 'm')), -1)
  // A lone release does not move anything.
  assert.equal(parseWheel(sgr(64, 'm')), 0)
})

test('parseWheel: a release does not cancel a real notch', () => {
  assert.equal(parseWheel(sgr(64) + sgr(65, 'm')), 1)
})
