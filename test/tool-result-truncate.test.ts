import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToolResult } from '../src/answer-parse.ts'

// A huge tool result used to be sliced silently (12_000 / 8000 chars),
// so the model could not tell it was looking at a PARTIAL output. The cap now
// appends an explicit marker.
test('a short result is returned unchanged', () => {
  assert.equal(truncateToolResult('hello', 100), 'hello')
})

test('an exactly-at-limit result is returned unchanged', () => {
  const s = 'x'.repeat(100)
  assert.equal(truncateToolResult(s, 100), s)
})

test('a long result carries an explicit truncation marker', () => {
  const s = 'x'.repeat(500)
  const out = truncateToolResult(s, 100)
  assert.ok(out.startsWith('x'.repeat(100)))
  assert.match(out, /\[\.\.\.truncated 400 chars\]/)
})

test('the marker reports the real number of omitted chars', () => {
  const s = 'y'.repeat(1234)
  const out = truncateToolResult(s, 1000)
  assert.match(out, /\[\.\.\.truncated 234 chars\]/)
})

test('a cut near a line boundary keeps whole lines', () => {
  const line = 'a'.repeat(30) + String.fromCharCode(10) // 31 chars per line
  const s = line.repeat(50) // 1550 chars
  const out = truncateToolResult(s, 1000)
  const NL = String.fromCharCode(10)
  // Strip the marker line we appended: the kept content is everything up to
  // the last NL that precedes "[...truncated".
  const kept = out.slice(0, out.indexOf(NL + '[...'))
  // A whole number of 31-char lines was kept (no half line).
  assert.equal(kept.length % 31, 0)
  assert.ok(kept.length <= 1000 && kept.length > 1000 - 31)
  assert.match(out, /\[\.\.\.truncated \d+ chars\]/)
})

// A CJK/emoji-heavy result must not be cut INSIDE a surrogate pair: a lone
// high surrogate at the cut is a broken code point, and some channels turn it
// into '?' or drop the rest of the text.
test('truncation never leaves a lone surrogate at the cut', () => {
  const emoji = String.fromCodePoint(0x1f600)
  const text = emoji.repeat(50)
  // Limit lands in the MIDDLE of the 20th emoji (2 UTF-16 units each).
  const out = truncateToolResult(text, 41)
  const kept = out.split(String.fromCharCode(10))[0]
  const last = kept.codePointAt(kept.length - 2) as number
  assert.ok(
    last < 0xd800 || last > 0xdfff,
    'the kept text ends with a lone surrogate: ' + last.toString(16),
  )
})
