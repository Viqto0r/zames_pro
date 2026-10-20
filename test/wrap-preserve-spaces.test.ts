// wrapToWidth must preserve the SPACES of the line, not just its words: the
// leading indentation and a run of inner spaces are part of the layout of a
// warning / echoed operator message. The old split(' ')/join(' ') collapsed
// `'a  b'` to `'a b'` and dropped the indent entirely.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wrapToWidth, visLen } from '../src/input.ts'

const NL = String.fromCharCode(10)

test('a short line is returned byte-for-byte', () => {
  assert.equal(wrapToWidth('  lead', 20), '  lead')
  assert.equal(wrapToWidth(' a', 20), ' a')
  assert.equal(wrapToWidth('a  b', 20), 'a  b')
  assert.equal(wrapToWidth('   ', 20), '   ')
})

test('wrapping keeps the leading indent of the first line', () => {
  const out = wrapToWidth('  aaa bbb ccc', 8)
  assert.equal(out.split(NL)[0], '  aaa')
  for (const line of out.split(NL)) assert.ok(visLen(line) <= 8, line)
})

test('wrapping keeps the inner spaces between words', () => {
  assert.equal(wrapToWidth('aaa  bbb ccc', 20), 'aaa  bbb ccc')
})

test('a wrapped line breaks only between whole words', () => {
  const out = wrapToWidth('aaa bbb ccc ddd', 7)
  const lines = out.split(NL)
  for (const line of lines) {
    assert.ok(visLen(line) <= 7, 'too wide: ' + line)
    assert.equal(line.trim(), line)
  }
  // No two words are glued into one (`aaabbb` was the bug).
  for (const line of lines) {
    assert.ok(['aaa bbb', 'ccc ddd'].includes(line), line)
  }
})
