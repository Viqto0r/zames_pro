import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { applyUpdateHunk, createExtraTools } from '../src/extraTools.ts'

const NL = String.fromCharCode(10)

// A patch may carry SEVERAL @@ hunks for one file. Before the fix every hunk
// was flattened into one block and matched as a single contiguous anchor, so
// a multi-hunk patch always failed with "Context not found".
test('applyUpdateHunk applies several @@ hunks of one file', () => {
  const content = ['x', 'a', 'b', 'x', 'a', 'b', 'z'].join(NL)
  const hunk = [
    '@@ -2,2 +2,2 @@',
    ' a',
    '-b',
    '+FIRST',
    '@@ -5,2 +5,2 @@',
    ' a',
    '-b',
    '+SECOND',
  ]
  const res = applyUpdateHunk(content, hunk)
  assert.equal(res.ok, true, res.error ?? 'expected ok')
  assert.equal(
    res.content as string,
    ['x', 'a', 'FIRST', 'x', 'a', 'SECOND', 'z'].join(NL),
  )
})

// The @@ header carries the old line number; when the anchor text repeats it
// is the ONLY thing that tells hunks apart. Ignoring it patched the wrong
// occurrence (the first one) instead of the one the patch pointed at.
test('applyUpdateHunk honours the @@ header line number for repeated context', () => {
  const content = ['a', 'x', 'y', 'a', 'b'].join(NL)
  const hunk = ['@@ -4,2 +4,2 @@', ' a', '-b', '+B']
  const res = applyUpdateHunk(content, hunk)
  assert.equal(res.ok, true, res.error ?? 'expected ok')
  assert.equal(res.content as string, ['a', 'x', 'y', 'a', 'B'].join(NL))
})

// End-to-end: ApplyPatch must apply a realistic multi-hunk update.
test('ApplyPatch applies a multi-hunk update to one file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zames-aph-'))
  await fs.writeFile(
    path.join(dir, 'f.txt'),
    ['x', 'a', 'b', 'x', 'a', 'b', 'z'].join(NL),
    'utf-8',
  )
  const tools = createExtraTools(dir, {})
  const ap = tools.find((t) => t.name === 'ApplyPatch')
  assert.ok(ap)
  const patch = [
    '*** Begin Patch',
    '*** Update File: f.txt',
    '@@ -2,2 +2,2 @@',
    ' a',
    '-b',
    '+FIRST',
    '@@ -5,2 +5,2 @@',
    ' a',
    '-b',
    '+SECOND',
    '*** End Patch',
  ].join(NL)
  await ap.fn({ patch })
  assert.equal(
    await fs.readFile(path.join(dir, 'f.txt'), 'utf-8'),
    ['x', 'a', 'FIRST', 'x', 'a', 'SECOND', 'z'].join(NL),
  )
  await fs.rm(dir, { recursive: true, force: true })
})
