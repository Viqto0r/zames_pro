import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unescapeJsonString } from '../src/commands.ts'

// unescapeJsonString decodes the JSON escapes inside a captured `respond`
// message, which is then PRINTED (restored dialogue, /resume). A `\uD800`
// escape not followed by a low surrogate (a truncated or hand-written chat
// payload) produced a LONE HIGH surrogate - a broken code point some terminals
// render as `?` or drop together with the rest of the line.
const lone = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < s.length ? s.charCodeAt(i + 1) : 0
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true
      i++
    } else if (c >= 0xdc00 && c <= 0xdfff) return true
  }
  return false
}

test('a lone high surrogate escape is not left in the text', () => {
  const s = unescapeJsonString('x\\ud800y')
  assert.equal(lone(s), false, JSON.stringify(s))
})

test('a valid surrogate pair still decodes to one code point', () => {
  const s = unescapeJsonString('\\ud83d\\ude00')
  assert.equal(s, '😀')
})

test('a lone LOW surrogate is not left either', () => {
  assert.equal(lone(unescapeJsonString('a\\udc00b')), false)
})
