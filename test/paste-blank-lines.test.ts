import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countPasteLines,
  pasteReplacement,
  expandPastes,
} from '../src/input/layout.ts'

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

// A paste of a log tail / stack trace often ends with BLANK lines. The line
// count used to strip ALL trailing newlines, so `a\n\n\n` was reported as ONE
// line: the paste was inserted verbatim instead of being collapsed, and the
// `[Pasted lines#N]` marker (the whole point of the collapse) never appeared.
// The trailing newline is a LINE TERMINATOR, only the very last one is not an
// extra line - the blank lines before it ARE lines.
test('countPasteLines counts BLANK lines at the end of a paste', () => {
  assert.equal(countPasteLines('a' + NL + NL), 2)
  assert.equal(countPasteLines('a' + NL + NL + NL), 3)
  assert.equal(countPasteLines(NL + NL), 2)
  assert.equal(countPasteLines(NL + NL + NL), 3)
  // CRLF / lone CR normalize the same way.
  assert.equal(countPasteLines('a' + CR + NL + CR + NL), 2)
  assert.equal(countPasteLines('a' + CR + CR), 2)
  // A single trailing newline still does not add a line.
  assert.equal(countPasteLines('a' + NL), 1)
  assert.equal(countPasteLines('a' + NL + 'b' + NL), 2)
})

test('a paste with trailing blank lines collapses into a marker', () => {
  const raw = 'line one' + NL + 'line two' + NL + NL
  const rep = pasteReplacement(raw)
  assert.ok(rep, 'a 3-line paste must be collapsed, got null')
  assert.equal(rep.marker, '[Pasted lines#3]')
  assert.equal(rep.text, raw)
  const buf = 'see: ' + rep.marker
  assert.equal(expandPastes([rep], buf), 'see: ' + raw)
})

test('a blank-only paste collapses instead of flooding the input line', () => {
  const raw = NL + NL + NL
  const rep = pasteReplacement(raw)
  assert.ok(rep)
  assert.equal(rep.marker, '[Pasted lines#3]')
  assert.equal(expandPastes([rep], rep.marker), raw)
})
