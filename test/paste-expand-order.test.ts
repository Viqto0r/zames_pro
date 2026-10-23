import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandPastes, pasteReplacement } from '../src/input/layout.ts'

const NL = String.fromCharCode(10)

// The input line collapses a big paste into a marker `[Pasted lines#N]` and
// expands it back on submit. The marker carries ONLY the line COUNT, so two
// different 3-line pastes get the SAME marker text.
//
// When the operator deletes ONE of two identical markers, the buffer no longer
// says which paste survived. The old code GUESSED (last occurrence -> last
// paste) and the model received the WRONG pasted text under a plausible
// marker — a silent corruption. Ambiguity must be visible: the marker is left
// as is, and the operator sees `[Pasted lines#3]` in the sent message instead
// of someone else's body.
test('one of two identical markers is ambiguous, not swapped', () => {
  const a = pasteReplacement('alpha' + NL + 'beta' + NL + 'gamma')!
  const b = pasteReplacement('one' + NL + 'two' + NL + 'three')!
  assert.equal(a.marker, b.marker, 'the markers are identical by design')
  // Only ONE marker left: the operator deleted the other one.
  assert.equal(expandPastes([a, b], b.marker), b.marker)
})

// A KNOWN deletion makes the mapping exact: the caller says which paste was
// removed, so the survivor expands to its own body.
test('a known deleted paste resolves the survivor correctly', () => {
  const a = pasteReplacement('alpha' + NL + 'beta' + NL + 'gamma')!
  const b = pasteReplacement('one' + NL + 'two' + NL + 'three')!
  // The operator deleted B — the surviving marker is A's.
  assert.equal(
    expandPastes([a, b], a.marker, 1),
    'alpha' + NL + 'beta' + NL + 'gamma',
  )
  // The operator deleted A — the surviving marker is B's.
  assert.equal(
    expandPastes([a, b], b.marker, 0),
    'one' + NL + 'two' + NL + 'three',
  )
})

test('two pastes in order expand in their own places', () => {
  const a = pasteReplacement('alpha' + NL + 'beta' + NL + 'gamma')!
  const b = pasteReplacement('one' + NL + 'two' + NL + 'three')!
  const out = expandPastes([a, b], a.marker + ' and ' + b.marker)
  assert.equal(
    out,
    'alpha' + NL + 'beta' + NL + 'gamma and one' + NL + 'two' + NL + 'three',
  )
})

test('a single paste still expands', () => {
  const a = pasteReplacement('x' + NL + 'y' + NL + 'z')!
  assert.equal(
    expandPastes([a], 'pre ' + a.marker + ' post'),
    'pre x' + NL + 'y' + NL + 'z post',
  )
})

test('a missing marker leaves the text unchanged', () => {
  const a = pasteReplacement('x' + NL + 'y' + NL + 'z')!
  assert.equal(expandPastes([a], 'no marker here'), 'no marker here')
})
