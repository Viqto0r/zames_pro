import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PASTE_MIN_LINES,
  SUGGEST_PAGE,
  isSubsequence,
  countPasteLines,
  formatPasteMarker,
  pasteReplacement,
  expandPastes,
  visRows,
  visLen,
  charWidth,
} from '../src/input/layout.ts'

// src/input/layout.ts holds the PURE halves of the editor: the visual layout
// (covered by input-layout/layout-wrap) and the PASTE markers, which turn a
// multi-line paste into a one-line placeholder. The paste round trip is what
// keeps a pasted block from being submitted line by line, so it is pinned
// here; the fuzzy slash matcher already has its own suggest-* files.

const NL = String.fromCharCode(10)

test('the paste marker needs at least PASTE_MIN_LINES lines', () => {
  assert.equal(PASTE_MIN_LINES, 3)
  assert.equal(countPasteLines('a' + NL + 'b'), 2)
  assert.equal(countPasteLines('a' + NL + 'b' + NL + 'c'), 3)
  assert.equal(countPasteLines('one line'), 1)
})

test('a short paste is NOT turned into a marker', () => {
  assert.equal(pasteReplacement('a' + NL + 'b'), null)
  assert.equal(pasteReplacement('one line'), null)
})

test('a 3+ line paste becomes a numbered marker', () => {
  const r = pasteReplacement('a' + NL + 'b' + NL + 'c')
  assert.ok(r)
  assert.equal(r?.marker, '[Pasted lines#3]')
})

test('formatPasteMarker carries the line count', () => {
  const m = formatPasteMarker(7)
  assert.match(m, /7/)
})

test('expandPastes puts the original text back at the marker', () => {
  const raw = 'x' + NL + 'y' + NL + 'z'
  const rep = pasteReplacement(raw)
  assert.ok(rep)
  const line = 'before ' + rep!.marker + ' after'
  const out = expandPastes([rep!], line)
  assert.equal(out, 'before ' + raw + ' after')
})

test('expandPastes without pastes leaves the text unchanged', () => {
  assert.equal(expandPastes([], 'plain'), 'plain')
})

test('an AMBIGUOUS marker (two same-size pastes) is left as is', () => {
  const raw = 'a' + NL + 'b' + NL + 'c'
  const rep = pasteReplacement(raw)!
  // Two pastes of the same length produce the SAME marker; one survived.
  // Without a deletion hint the body cannot be known, so the literal marker
  // stays visible instead of sending the wrong text.
  const out = expandPastes([rep, rep], rep.marker)
  assert.equal(out, rep.marker)
})

test('isSubsequence is a true subsequence, not a substring', () => {
  assert.equal(isSubsequence('hst', 'history'), true)
  assert.equal(isSubsequence('hsx', 'history'), false)
  assert.equal(isSubsequence('', 'anything'), true)
})

test('visLen counts a wide character as two columns', () => {
  assert.equal(visLen('ab'), 2)
  assert.equal(visLen('日本'), 4)
  assert.equal(charWidth(0x65e5), 2)
  assert.equal(charWidth(0x61), 1)
})

test('visRows wraps at the given column count', () => {
  assert.equal(visRows('hello', 10), 1)
  assert.equal(visRows('hello world', 5), 3)
  assert.equal(visRows('', 10), 1)
})

test('SUGGEST_PAGE is a small positive page size', () => {
  assert.ok(SUGGEST_PAGE > 0 && SUGGEST_PAGE < 50)
})
