// formatResult() caps a fetched page by a RAW slice of UTF-16 units. An emoji
// or astral CJK char on the boundary loses its low half, so WebFetch hands the
// model a lone high surrogate — the same broken-code-point class already fixed
// in truncateToolResult / capReport / summarizeDiagnostics.
//
// `formatResult` is private, so the check drives the exported `capFetchedText`
// (the pure clip that formatResult uses).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capFetchedText } from '../src/web.ts'

function hasLoneHigh(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1)
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true
      i++
    }
  }
  return false
}

test('a capped page does not end on a lone surrogate', () => {
  const text = 'a'.repeat(99) + '\ud83d\ude00' + 'tail'
  const out = capFetchedText(text, 100)
  assert.ok(
    !hasLoneHigh(out),
    'lone surrogate: ' + JSON.stringify(out.slice(-4)),
  )
})

test('a short page is unchanged (control)', () => {
  assert.equal(capFetchedText('hello', 100), 'hello')
})
