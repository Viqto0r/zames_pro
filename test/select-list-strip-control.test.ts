import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripControl } from '../src/tui/SelectList.tsx'

// test/select-list-title-escapes.test.ts only pins that SelectList CALLS a
// sanitizer (by source regex). The sanitizer itself decides what a provider
// title can do to the terminal, so its rules are pinned directly here.

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

test('a CSI sequence is removed, the text around it stays', () => {
  assert.equal(stripControl(ESC + '[2Jevil'), 'evil')
  assert.equal(stripControl('a' + ESC + '[1;31mred' + ESC + '[0m'), 'ared')
})

test('an OSC-8 hyperlink keeps its LABEL and drops the target', () => {
  const link =
    ESC + ']8;;http://evil.example' + BEL + 'CLICK' + ESC + ']8;;' + BEL
  assert.equal(stripControl(link), 'CLICK')
  // An unterminated OSC swallows the rest instead of leaking it as text.
  assert.equal(stripControl(ESC + ']8;;unterminated'), '')
  // The ST-terminated form (`ESC \\`) is handled too.
  const st =
    ESC +
    ']8;;http://x' +
    ESC +
    String.fromCharCode(92) +
    'OK' +
    ESC +
    ']8;;' +
    BEL
  assert.equal(stripControl(st), 'OK')
})

test('control bytes are removed but TAB, NEWLINE and CR survive', () => {
  const NUL = String.fromCharCode(0)
  const BELc = String.fromCharCode(7)
  const VT = String.fromCharCode(11)
  const FF = String.fromCharCode(12)
  const DEL = String.fromCharCode(127)
  assert.equal(stripControl('a' + NUL + 'b' + BELc + 'c'), 'abc')
  assert.equal(stripControl('x' + VT + FF + DEL + 'y'), 'xy')
  // Layout whitespace is NOT a control sequence: a title may contain it.
  assert.equal(
    stripControl('a' + String.fromCharCode(9) + 'b'),
    'a' + String.fromCharCode(9) + 'b',
  )
  assert.equal(
    stripControl('a' + String.fromCharCode(10) + 'b'),
    'a' + String.fromCharCode(10) + 'b',
  )
})

test('a null/undefined title becomes an empty string, never a throw', () => {
  assert.equal(stripControl(null as never), '')
  assert.equal(stripControl(undefined as never), '')
  assert.equal(stripControl(42 as never), '42')
})

test('plain text is returned unchanged', () => {
  assert.equal(stripControl('DeepSeek · chat 12'), 'DeepSeek · chat 12')
  assert.equal(stripControl(''), '')
})
