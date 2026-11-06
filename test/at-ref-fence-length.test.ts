import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inlineAtRefs } from '../src/attach-refs.ts'

// An `@file` reference is inlined into a markdown section as a fenced code
// block. The fence was a FIXED three backticks, so a file that itself contains
// a ``` fence (any markdown file!) closed the block early: the rest of the
// file was rendered as PROSE in the prompt, and the model could mistake its
// text for instructions.
//
// The fence must be longer than the longest backtick run in the file (the
// same rule formatGitContext already uses for the status preview).

const NL = String.fromCharCode(10)

test('a file containing a fence does not close the inlined block', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'atref-'))
  writeFileSync(
    path.join(dir, 'a.md'),
    'before' + NL + '```js' + NL + 'code' + NL + '```' + NL + 'after',
  )
  const r = await inlineAtRefs(dir, 'look @a.md please')
  // The wrapping fence must be LONGER than the inner ```.
  assert.match(r.text, /````/, 'the fence was not widened: ' + r.text)
  assert.equal(r.inlined.length, 1)
})

test('a file without backticks still gets a plain fence', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'atref-'))
  writeFileSync(path.join(dir, 'plain.txt'), 'hello')
  const r = await inlineAtRefs(dir, 'look @plain.txt')
  assert.match(r.text, /```/)
})
