// formatExport() cuts a tool result at 500 UTF-16 units. An emoji / astral CJK
// char straddling the boundary loses its low half, so the exported Markdown
// carries a LONE high surrogate — a broken code point in the report the
// operator shares.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatExport } from '../src/commands.ts'

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

test('a tool result cut in the export does not leave a lone surrogate', () => {
  const big = 'a'.repeat(499) + '\ud83d\ude00' + 'tail'
  const md = formatExport([
    { type: 'tool_result', tool: 'Read', result: big },
  ] as never)
  assert.ok(!hasLoneHigh(md), 'lone surrogate in the export')
})

test('a short result is exported whole (control)', () => {
  const md = formatExport([
    { type: 'tool_result', tool: 'Read', result: 'ok' },
  ] as never)
  assert.ok(md.includes(' -> Read: ok'))
})
