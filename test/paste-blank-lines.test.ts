import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countPasteLines,
  pasteReplacement,
  expandPastes,
} from '../src/input/layout.ts'
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
test('countPasteLines counts BLANK lines at the end of a paste', () => {
  assert.equal(countPasteLines('a' + NL + NL), 2)
  assert.equal(countPasteLines('a' + NL + NL + NL), 3)
  assert.equal(countPasteLines(NL + NL), 2)
  assert.equal(countPasteLines(NL + NL + NL), 3)
  assert.equal(countPasteLines('a' + CR + NL + CR + NL), 2)
  assert.equal(countPasteLines('a' + CR + CR), 2)
  assert.equal(countPasteLines('a' + NL), 1)
  assert.equal(countPasteLines('a' + NL + 'b' + NL), 2)
})
test('a paste with trailing blank lines collapses into a marker', () => {
  const raw = 'line one' + NL + 'line two' + NL + NL
  const rep = pasteReplacement(raw)
  assert.ok(rep)
  assert.equal(rep.marker, '[Pasted lines#3]')
  assert.equal(rep.text, raw)
  assert.equal(expandPastes([rep], 'see: ' + rep.marker), 'see: ' + raw)
})
test('a blank-only paste collapses instead of flooding the input line', () => {
  const raw = NL + NL + NL
  const rep = pasteReplacement(raw)
  assert.ok(rep)
  assert.equal(rep.marker, '[Pasted lines#3]')
  assert.equal(expandPastes([rep], rep.marker), raw)
})
