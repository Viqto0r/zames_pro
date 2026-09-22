import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countPasteLines,
  formatPasteMarker,
  pasteReplacement,
  expandPastes,
  PASTE_MIN_LINES,
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
