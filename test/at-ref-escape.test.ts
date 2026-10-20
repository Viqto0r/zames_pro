// `@../secret` in a task text used to be INLINED: resolveAttachPath() falls
// back to `path.resolve(workdir, '..', s)`, so a reference to a sibling of the
// project resolved to a real file OUTSIDE the sandbox root and its contents
// were pasted into the prompt. Every other file access goes through
// safePath(); the `@`-inliner must refuse an escape instead of helping it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inlineAtRefs } from '../src/attach-refs.ts'
import { makeTmpDir } from './tmp-dir.ts'

async function tmp(
  t: { after: (fn: () => unknown) => unknown },
  prefix: string,
): Promise<string> {
  return makeTmpDir(t, prefix)
}

test('inlineAtRefs does not read a file above the working directory', async (t) => {
  const parent = await tmp(t, 'zames-atref-parent-')
  const workdir = path.join(parent, 'proj')
  await fs.mkdir(workdir, { recursive: true })
  await fs.writeFile(path.join(parent, 'secret.txt'), 'TOP SECRET', 'utf-8')

  const res = await inlineAtRefs(workdir, 'please read @../secret.txt now')
  assert.equal(res.inlined.length, 0)
  assert.ok(!res.text.includes('TOP SECRET'))
  assert.ok(res.text.includes('@../secret.txt'), 'the text is left as-is')
})

test('inlineAtRefs still inlines a file inside the working directory', async (t) => {
  const workdir = await tmp(t, 'zames-atref-inside-')
  await fs.writeFile(path.join(workdir, 'a.txt'), 'inside', 'utf-8')

  const res = await inlineAtRefs(workdir, 'read @a.txt')
  assert.deepEqual(res.inlined, ['a.txt'])
  assert.ok(res.text.includes('inside'))
})

test('a symlink inside the project pointing outside is refused', async (t) => {
  if (process.platform === 'win32') return
  const parent = await tmp(t, 'zames-atref-link-')
  const workdir = path.join(parent, 'proj')
  await fs.mkdir(workdir, { recursive: true })
  await fs.writeFile(path.join(parent, 'secret.txt'), 'TOP SECRET', 'utf-8')
  await fs.symlink(path.join(parent, 'secret.txt'), path.join(workdir, 'l.txt'))

  const res = await inlineAtRefs(workdir, 'read @l.txt')
  assert.deepEqual(res.inlined, [])
  assert.ok(!res.text.includes('TOP SECRET'))
})

test('an escaping candidate does not hide a sibling inside the project', async (t) => {
  // process.cwd() is the zames repo while workdir is a temp dir: the cwd
  // candidate `process.cwd()/<name>` may exist and must not shadow the real
  // file inside workdir (the old code returned the escaping candidate first).
  const workdir = await tmp(t, 'zames-atref-sibling-')
  await fs.writeFile(
    path.join(workdir, 'package.json'),
    '{"inside":true}',
    'utf-8',
  )

  const res = await inlineAtRefs(workdir, 'read @package.json')
  assert.deepEqual(res.inlined, ['package.json'])
  assert.ok(res.text.includes('"inside":true'))
})
