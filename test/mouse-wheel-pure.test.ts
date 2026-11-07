import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseWheel,
  incompleteTail,
  mouseModeSequences,
} from '../src/tui/useMouseWheel.ts'

// The wheel hook writes terminal MODE sequences and parses raw SGR bytes. The
// modifier cases have their own file; pinned here is the rest: the direction,
// the release-filter (a press+release pair must not count twice), the
// incomplete-sequence tail kept across two `data` events, and the EXACT bytes
// and ORDER of each mode (1000/1006 on FIRST, then 1007 off — some terminals
// only apply 1007l while reporting is on).

const ESC = String.fromCharCode(27)

function sgr(cb: number, term = 'M'): string {
  return ESC + '[<' + cb + ';10;20' + term
}

test('wheel up is +1 and wheel down is -1', () => {
  assert.equal(parseWheel(sgr(64)), 1)
  assert.equal(parseWheel(sgr(65)), -1)
})

test('several notches in one chunk are summed', () => {
  assert.equal(parseWheel(sgr(64) + sgr(64) + sgr(65)), 1)
})

test('a RELEASE report (lowercase m) is not a wheel', () => {
  // A terminal may report both the press and its release: counting both made
  // every notch scroll twice.
  assert.equal(parseWheel(sgr(64, 'm')), 0)
  assert.equal(parseWheel(sgr(64) + sgr(64, 'm')), 1)
})

test('a chunk without a wheel sequence is 0', () => {
  assert.equal(parseWheel('plain text'), 0)
  assert.equal(parseWheel(''), 0)
  assert.equal(parseWheel(ESC + '[A'), 0)
})

test('a complete sequence leaves no tail', () => {
  assert.equal(incompleteTail(sgr(64)), '')
  assert.equal(incompleteTail('plain'), '')
})

test('a SPLIT sequence keeps its tail for the next chunk', () => {
  const full = sgr(64)
  const head = full.slice(0, 6)
  const rest = full.slice(6)
  assert.equal(incompleteTail(head), head)
  // Re-joined with the tail the notch is counted once.
  assert.equal(parseWheel(incompleteTail(head) + rest), 1)
})

test('SCROLL mode enables reporting FIRST, then disables alt-scroll', () => {
  const { on, off } = mouseModeSequences(true)
  const i1000 = on.indexOf(ESC + '[?1000h')
  const i1006 = on.indexOf(ESC + '[?1006h')
  const i1007 = on.indexOf(ESC + '[?1007l')
  assert.ok(i1000 >= 0 && i1006 > i1000, '1000h then 1006h')
  assert.ok(i1007 > i1006, '1007l after reporting is on')
  // The off pair turns the alternate-scroll bit back ON (the terminal default)
  // and clears the reporting bits.
  assert.ok(off.includes(ESC + '[?1006l'))
  assert.ok(off.includes(ESC + '[?1000l'))
  assert.ok(off.includes(ESC + '[?1007h'))
})

test('SELECT mode PRIMES 1007l with reporting on, then turns reporting off', () => {
  const { on, off } = mouseModeSequences(false)
  // Some terminals ignore 1007l while reporting is off, so the mount write is a
  // prime: reporting on, 1007l, reporting off again — in THAT order.
  const on1000 = on.indexOf(ESC + '[?1000h')
  const on1007 = on.indexOf(ESC + '[?1007l')
  const off1000 = on.lastIndexOf(ESC + '[?1000l')
  assert.ok(on1000 >= 0 && on1007 > on1000, 'reporting on, then 1007l')
  assert.ok(off1000 > on1007, 'reporting off AFTER the prime')
  // The STEADY state ends with reporting off: the last reporting bit is `l`.
  assert.ok(
    on.lastIndexOf('1000l') > on.lastIndexOf('1000h'),
    'reporting ends OFF',
  )
  // Unmount guarantees the reporting bits are clear too.
  assert.ok(off.includes(ESC + '[?1000l'))
  assert.ok(off.includes(ESC + '[?1006l'))
})

test('the two modes are mutually exclusive on the alternate-scroll bit', () => {
  assert.equal(mouseModeSequences(true).on.includes('1007h'), false)
  assert.equal(mouseModeSequences(false).off.includes('1007l'), false)
})
