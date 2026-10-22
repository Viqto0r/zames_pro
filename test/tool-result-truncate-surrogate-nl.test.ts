// truncateToolResult() cuts a tool result at a LINE boundary when one is close
// to the limit. The surrogate-pair guard ran ONLY in the hard-cut branch: a
// NEWLINE that fell right after a lone HIGH surrogate (a channel that dropped
// the low half, or a cut that already lost it) kept `cut = nl + 1`, so the
// model received a broken code point together with the truncation marker.
// The same guard must apply when the boundary is a newline.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToolResult } from '../src/answer-parse.ts'

const NL = String.fromCharCode(10)
const HIGH = String.fromCharCode(0xd83d)

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1)
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true
    }
  }
  return false
}

test('a line-boundary cut does not keep a lone high surrogate', () => {
  const text = 'a'.repeat(98) + HIGH + NL + 'rest of the answer'.repeat(20)
  const out = truncateToolResult(text, 100)
  assert.equal(hasLoneSurrogate(out), false, JSON.stringify(out.slice(90, 110)))
  assert.ok(out.includes('[...truncated'), out)
})

test('a hard cut still drops the pair whole', () => {
  const text = 'a'.repeat(99) + HIGH + String.fromCharCode(0xde00)
  const out = truncateToolResult(text, 100)
  assert.equal(hasLoneSurrogate(out), false)
})
