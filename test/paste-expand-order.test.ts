import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandPastes, pasteReplacement } from '../src/input/layout.ts'

// The input line collapses a big paste into a marker `[Pasted lines#N]` and
// expands it back on submit. The marker carries ONLY the line COUNT, so two
// different 3-line pastes get the SAME marker text. `expandPastes` replaces
// markers in ORDER by FIRST occurrence, so if the operator pastes A, then B,
// and finally deletes A's marker (a natural edit), B's paste expands into...
// nothing, and the surviving marker is filled with A's text: the model gets
// the WRONG paste. The expansion must consume each marker occurrence ONCE.

test('a deleted first marker does not swap the remaining paste', () => {
  const a = pasteReplacement('alpha\nbeta\ngamma')!
  const b = pasteReplacement('one\ntwo\nthree')!
  assert.equal(a.marker, b.marker, 'the markers are identical by design')
  // A was deleted from the line; only B's marker is left.
  const out = expandPastes([a, b], b.marker)
  assert.equal(out, 'one\ntwo\nthree')
})

test('two pastes in order expand in their own places', () => {
  const a = pasteReplacement('alpha\nbeta\ngamma')!
  const b = pasteReplacement('one\ntwo\nthree')!
  const out = expandPastes([a, b], a.marker + ' and ' + b.marker)
  assert.equal(out, 'alpha\nbeta\ngamma and one\ntwo\nthree')
})

test('a single paste still expands', () => {
  const a = pasteReplacement('x\ny\nz')!
  assert.equal(
    expandPastes([a], 'pre ' + a.marker + ' post'),
    'pre x\ny\nz post',
  )
})

test('a missing marker leaves the text unchanged', () => {
  const a = pasteReplacement('x\ny\nz')!
  assert.equal(expandPastes([a], 'no marker here'), 'no marker here')
})
