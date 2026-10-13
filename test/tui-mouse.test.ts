// Unit tests for the mouse-wheel SGR parser (src/tui/useMouseWheel.ts).
// Ink does not parse mouse events, so this parser is the only thing that turns
// the raw terminal bytes into a scroll delta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWheel, incompleteTail } from '../src/tui/useMouseWheel.ts'

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
