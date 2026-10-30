// `normalizeRestoredMessage` shortens a message longer than
// RESTORED_MESSAGE_MAX with `text.slice(0, MAX) + '…'`. The slice is in UTF-16
// units, so an emoji / astral CJK char sitting on the boundary is cut in half
// and the restored dialogue shows a lone surrogate (a broken code point in the
// terminal). Every OTHER cut in this codebase steps back one unit when it lands
// on a high surrogate; this one did not.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRestoredMessage } from '../src/restore-history.ts'

const MAX = 100_000

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

test('the restored-history cut never leaves a lone high surrogate', () => {
  const emoji = String.fromCharCode(0xd83d) + String.fromCharCode(0xde00)
  const text = 'x'.repeat(MAX - 1) + emoji + 'tail'
  const m = normalizeRestoredMessage({ role: 'assistant', text })
  assert.ok(m)
  assert.equal(
    hasLoneSurrogate(m.text),
    false,
    JSON.stringify(m.text.slice(-5)),
  )
})

test('a normal message is not modified', () => {
  const m = normalizeRestoredMessage({ role: 'assistant', text: 'short' })
  assert.deepEqual(m, { role: 'assistant', text: 'short' })
})
