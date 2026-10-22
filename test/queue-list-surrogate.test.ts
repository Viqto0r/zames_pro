// formatQueueList() shows each queued message as ONE line, truncated to 80
// chars. The cut is a raw slice: when a surrogate PAIR (an emoji / astral CJK
// char) straddles the boundary, the kept text ends on a lone HIGH surrogate
// and the operator sees a broken code point in the /queue listing (and the
// same text is captured in the transcript). The cut must drop the pair WHOLE,
// like truncateToolResult / capReport.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatQueueList } from '../src/commands.ts'

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

test('a queued message cut inside a surrogate pair keeps no lone half', () => {
  const text = 'x'.repeat(79) + String.fromCharCode(0xd83d, 0xde00) + 'tail'
  const out = formatQueueList([{ text } as never])[0]
  assert.equal(hasLoneSurrogate(out), false, JSON.stringify(out.slice(70)))
  assert.ok(out.includes('…'))
})

test('a plain long message is still truncated with an ellipsis', () => {
  const out = formatQueueList([{ text: 'a '.repeat(100) } as never])[0]
  assert.ok(out.includes('…'))
})
