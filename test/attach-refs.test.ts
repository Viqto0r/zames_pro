import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveAttachPath, inlineAtRefs } from '../src/attach-refs.ts'

async function mkTmp(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'zames-aref-'))
}

test('resolveAttachPath resolves a relative file', async () => {
  const root = await mkTmp()
  await fs.writeFile(path.join(root, 'a.ts'), 'x')
  const p = await resolveAttachPath(root, 'a.ts')
  assert.ok(p && p.endsWith('a.ts'))
})

test('resolveAttachPath strips quotes', async () => {
  const root = await mkTmp()
  await fs.writeFile(path.join(root, 'a.ts'), 'x')
  const dq = String.fromCharCode(34)
  const p = await resolveAttachPath(root, dq + 'a.ts' + dq)
  assert.ok(p)
})

test('resolveAttachPath returns null for a missing file', async () => {
  const root = await mkTmp()
  assert.equal(await resolveAttachPath(root, 'nope.ts'), null)
})

test('resolveAttachPath returns null for non-path text', async () => {
  const root = await mkTmp()
  assert.equal(await resolveAttachPath(root, 'just some words'), null)
})

test('inlineAtRefs inlines an existing @ref', async () => {
  const root = await mkTmp()
  await fs.writeFile(path.join(root, 'b.ts'), 'CONTENT-ABC')
  const res = await inlineAtRefs(root, 'look at @b.ts please')
  assert.ok(res.text.includes('## Files referenced with @ in the task'))
  assert.ok(res.text.includes('CONTENT-ABC'))
  assert.deepEqual(res.inlined, ['b.ts'])
})

test('inlineAtRefs leaves a missing @ref untouched', async () => {
  const root = await mkTmp()
  const res = await inlineAtRefs(root, 'look at @missing.ts please')
  assert.equal(res.inlined.length, 0)
  assert.equal(res.text, 'look at @missing.ts please')
})

test('inlineAtRefs truncates a file over the per-file cap', async () => {
  const root = await mkTmp()
  await fs.writeFile(path.join(root, 'big.ts'), 'x'.repeat(70 * 1024))
  const res = await inlineAtRefs(root, 'see @big.ts')
  assert.ok(res.text.includes('(truncated at'))
})
