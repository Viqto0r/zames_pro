import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { listTsFiles, selfReviewFocusLine } from '../src/self-review.ts'
import { makeTmpDir } from './tmp-dir.ts'

// test/self-review.test.ts pins the recursion and the top-level `_context`
// skip; test/self-review-focus-newline.test.ts pins the focus injection. The
// FILTER edges were open: which extensions count, the case of `.ts`, a FILE
// named `_context` (must not be skipped as a folder) and a nested folder that
// merely CONTAINS `_context` (which the snapshot must keep).

async function mk(root: string, rel: string, body = 'x'): Promise<void> {
  const p = path.join(root, rel)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, body)
}

test('only a lowercase .ts file is part of the snapshot', async (t) => {
  const root = await makeTmpDir(t, 'zames-sr-')
  await mk(root, 'a.ts')
  await mk(root, 'b.tsx')
  await mk(root, 'c.js')
  await mk(root, 'B.TS')
  await mk(root, 'notes.md')
  assert.deepEqual(await listTsFiles(root), ['a.ts'])
})

test('the TOP-LEVEL _context folder is skipped, a nested one is not', async (t) => {
  const root = await makeTmpDir(t, 'zames-sr-')
  await mk(root, '_context', 'c.ts')
  await mk(root, 'x/_context/y.ts')
  await mk(root, 'x/z.ts')
  const rels = (await listTsFiles(root)).sort()
  assert.deepEqual(rels, ['x/_context/y.ts', 'x/z.ts'])
})

test('a FILE named _context is kept (it is not the read-only folder)', async (t) => {
  const root = await makeTmpDir(t, 'zames-sr-')
  // The skip test is on a DIRECTORY: a plain file with that name is a normal
  // module only if it ends in `.ts`, so give it the extension.
  await mk(root, '_context.ts', 'export const x = 1')
  assert.deepEqual(await listTsFiles(root), ['_context.ts'])
})

test('an empty directory lists nothing', async (t) => {
  const root = await makeTmpDir(t, 'zames-sr-')
  assert.deepEqual(await listTsFiles(root), [])
})

test('the focus line is one line, trimmed, and empty for no focus', () => {
  const NL = String.fromCharCode(10)
  assert.equal(selfReviewFocusLine(undefined), '')
  assert.equal(selfReviewFocusLine(''), '')
  assert.equal(selfReviewFocusLine('   ' + NL + '  '), '')
  const line = selfReviewFocusLine('  security ' + NL + ' and' + NL + 'races ')
  assert.ok(line.includes('focus especially on: security and races'))
  // The line is wrapped in blank lines, as the prompt template expects.
  assert.ok(line.startsWith(NL))
  assert.ok(line.endsWith(NL))
})
