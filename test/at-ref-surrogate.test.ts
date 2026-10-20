import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inlineAtRefs, AT_REF_FILE_CAP } from '../src/attach-refs.ts'

// `@path` inlining cuts a big file with a raw `slice`. A file whose cut lands
// between the halves of a surrogate pair (emoji, astral CJK) hands the model a
// lone high surrogate — the same broken code point fixed elsewhere
// (truncateToolResult / capReport / hook cuts).
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i++
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true
    }
  }
  return false
}

test('an inlined @file never ends on a lone high surrogate', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-atref-'))
  // One ASCII char so the cap boundary lands INSIDE the pair.
  const body = 'x' + '\u{1F600}'.repeat(AT_REF_FILE_CAP)
  await fs.writeFile(path.join(dir, 'big.md'), body, 'utf-8')
  const res = await inlineAtRefs(dir, 'please read @big.md')
  assert.ok(res.inlined.includes('big.md'), 'the file must be inlined')
  assert.equal(
    hasLoneSurrogate(res.text),
    false,
    'the inlined block contains a lone surrogate',
  )
  await fs.rm(dir, { recursive: true, force: true })
})
