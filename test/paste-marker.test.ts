import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countPasteLines,
  formatPasteMarker,
  pasteReplacement,
  expandPastes,
  PASTE_MIN_LINES,
  LineEditor,
} from '../src/input.ts'

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

test('countPasteLines считает строки', () => {
  assert.equal(countPasteLines('one'), 1)
  assert.equal(countPasteLines('a' + NL + 'b'), 2)
  assert.equal(countPasteLines('a' + NL + 'b' + NL + 'c'), 3)
  // A trailing newline doesn't add a line.
  assert.equal(countPasteLines('a' + NL + 'b' + NL + 'c' + NL), 3)
  // CRLF is normalized.
  assert.equal(countPasteLines('a' + CR + NL + 'b'), 2)
  // Lone CR is normalized too.
  assert.equal(countPasteLines('a' + CR + 'b'), 2)
})

test('formatPasteMarker даёт требуемый формат', () => {
  assert.equal(formatPasteMarker(3), '[Pasted lines#3]')
  assert.equal(formatPasteMarker(42), '[Pasted lines#42]')
})

test('1–2 строки вставляются как есть (маркер не нужен)', () => {
  assert.equal(pasteReplacement('one line'), null)
  assert.equal(pasteReplacement('a' + NL + 'b'), null)
})

test('3+ строк сворачиваются в маркер', () => {
  const rep = pasteReplacement('a' + NL + 'b' + NL + 'c')
  assert.ok(rep)
  assert.equal(rep.marker, '[Pasted lines#3]')
  assert.equal(rep.text, 'a' + NL + 'b' + NL + 'c')
})

test('PASTE_MIN_LINES — порог в 3 строки', () => {
  assert.equal(PASTE_MIN_LINES, 3)
})

test('expandPastes возвращает исходный текст', () => {
  const raw = 'a' + NL + 'b' + NL + 'c'
  const rep = pasteReplacement(raw)
  assert.ok(rep)
  const buf = 'вот код: ' + rep.marker
  assert.equal(expandPastes([rep], buf), 'вот код: ' + raw)
})

test('expandPastes разворачивает несколько маркеров по порядку', () => {
  const r1 = pasteReplacement('a' + NL + 'b' + NL + 'c')
  const r2 = pasteReplacement('x' + NL + 'y' + NL + 'z')
  assert.ok(r1 && r2)
  const buf = r1.marker + ' и ' + r2.marker
  assert.equal(
    expandPastes([r1, r2], buf),
    'a' + NL + 'b' + NL + 'c' + ' и ' + 'x' + NL + 'y' + NL + 'z',
  )
})

test('expandPastes терпим к удалённому маркеру', () => {
  const rep = pasteReplacement('a' + NL + 'b' + NL + 'c')
  assert.ok(rep)
  // The marker was deleted from the buffer — nothing to expand.
  assert.equal(expandPastes([rep], 'hello'), 'hello')
})

import { splitPasteTail } from '../src/input.ts'
const ESC = String.fromCharCode(27)
const PASTE_START = ESC + '[200~'
const PASTE_END = ESC + '[201~'

test('splitPasteTail holds a partial PASTE_START tail', () => {
  const r = splitPasteTail('abc' + ESC + '[20')
  assert.equal(r.tail, ESC + '[20')
  assert.equal(r.head, 'abc')
  // The held tail is a genuine prefix of a marker.
  assert.ok(PASTE_START.startsWith(r.tail as string))
})

test('splitPasteTail holds a partial PASTE_END tail', () => {
  const r = splitPasteTail('x' + ESC + '[2')
  assert.equal(r.tail, ESC + '[2')
  assert.equal(r.head, 'x')
  assert.ok(
    PASTE_END.startsWith(r.tail as string) ||
      PASTE_START.startsWith(r.tail as string),
  )
})

test('splitPasteTail keeps a complete marker intact (no tail)', () => {
  const r = splitPasteTail('a' + PASTE_START)
  assert.equal(r.tail, null)
  assert.equal(r.head, 'a' + PASTE_START)
})

test('splitPasteTail does not swallow ordinary text', () => {
  const r = splitPasteTail('hello world')
  assert.equal(r.tail, null)
  assert.equal(r.head, 'hello world')
  // A trailing "[2" WITHOUT a leading ESC is plain text, not a marker prefix.
  const r2 = splitPasteTail('value[2')
  assert.equal(r2.tail, null)
  assert.equal(r2.head, 'value[2')
})

test('splitPasteTail on an empty string', () => {
  assert.deepEqual(splitPasteTail(''), { head: '', tail: null })
})

// A bracketed paste whose END marker (ESC[201~) is split across two stdin
// reads is NOT a partial PASTE_START: splitPasteTail() holds ESC[20, the next
// chunk starts with `1~…`, and the previous global hold spliced the head onto
// the BUFFER TEXT instead of the paste body — the pasted lines were lost and
// `1~` leaked into the input line.
test('splitPasteTail holds a partial END marker after paste CONTENT', () => {
  // The read ended in the middle of ESC[201~ after some pasted text.
  const chunk = 'line one' + NL + 'line two' + ESC + '[20'
  const r = splitPasteTail(chunk)
  assert.equal(r.tail, ESC + '[20')
  assert.ok(PASTE_END.startsWith(r.tail as string))
})

// Inside a bracketed paste the body is accumulated VERBATIM, so a chunk that
// happens to end with `ESC[20` (e.g. pasted text ending in a control char, or
// the REAL end marker split across reads) must NOT be held back: the hold is
// re-attached to the next chunk and inserted as text, so `1~` leaked into the
// input line. Reproduces the exact chunk sequence of a split END marker.
test('a split END marker inside a bracketed paste does not leak `1~`', () => {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  // Simulate two raw reads: the paste body + half the end marker, then the rest.
  const first = PASTE_START + 'hello' + NL + 'world' + ESC + '[20'
  const second = '1~'
  ;(e as unknown as { _onData: (s: string) => void })._onData(first)
  ;(e as unknown as { _onData: (s: string) => void })._onData(second)
  // The buffer holds the paste (collapsed to a marker is fine) and NOT `1~`.
  assert.equal(e.buf.includes('1~'), false, 'the held tail leaked: ' + e.buf)
})

// The LineEditor used to hold a partial END marker back even INSIDE a paste:
// the hold was re-attached to the next chunk as ordinary input text instead of
// the paste body, so the tail (`1~`) leaked into the input line. This drives
// the REAL _onData with the exact split chunk sequence.
test('LineEditor: a split END marker inside a paste does not leak its tail', () => {
  const e = new LineEditor()
  e._render = () => {}
  e._renderInputOnly = () => {}
  const feed = (s: string): void =>
    (e as unknown as { _onData: (x: string) => void })._onData(s)
  // Read 1: the paste start, the body, and the FIRST HALF of ESC[201~.
  feed(PASTE_START + 'hello' + NL + 'world' + ESC + '[20')
  // Read 2: the rest of the end marker.
  feed('1~')
  assert.equal(e.buf.includes('1~'), false, 'the held tail leaked: ' + e.buf)
  assert.equal(e.buf.includes('hello'), true, 'the paste body was lost')
})
