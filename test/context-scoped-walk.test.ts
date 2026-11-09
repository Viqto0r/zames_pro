import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadProjectContext } from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'

// The SCOPED (per-directory) AGENTS.md/MEMORY.md lookup is driven by the paths
// a task mentions. test/context-scoped-file-path.test.ts pins the file-vs-dir
// fix; the rest of the walk had no test at all: how a token is CLEANED from
// prose, which tokens are ignored, and that BOTH kinds of scoped file are
// picked up with the memory one keeping its own budget (TAIL-clipped).

async function mk(root: string, rel: string, body: string): Promise<void> {
  const p = path.join(root, rel)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, body)
}

const rel = (root: string, p: string): string =>
  path.relative(root, p).split(path.sep).join('/')

test('a file token wrapped in prose punctuation still pulls the rules', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-walk-')
  await mk(root, 'sub/deep/x.txt', 'x')
  await mk(root, 'sub/AGENTS.md', 'sub rules')
  await mk(root, 'sub/deep/AGENTS.md', 'deep rules')
  // `(sub/deep/y.py),` — a token that does NOT exist: the walk climbs from the
  // deepest EXISTING ancestor, so the deep rules still load even when the file
  // itself is only about to be created.
  const ctx = await loadProjectContext(root, [
    'see (sub/deep/y.py), please',
    'and sub/deep/x.txt',
  ])
  assert.deepEqual(
    (ctx.scopedAgents ?? []).map((f) => rel(root, f.path)),
    ['sub/deep/AGENTS.md', 'sub/AGENTS.md'],
  )
})

test('the deeper directory comes first (most specific wins)', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-walk-')
  await mk(root, 'a/b/c/f.ts', 'x')
  await mk(root, 'AGENTS.md', 'root')
  await mk(root, 'a/AGENTS.md', 'a')
  await mk(root, 'a/b/AGENTS.md', 'ab')
  await mk(root, 'a/b/c/AGENTS.md', 'abc')
  const ctx = await loadProjectContext(root, ['a/b/c/f.ts'])
  const order = (ctx.scopedAgents ?? []).map((f) => rel(root, f.path))
  assert.deepEqual(order, ['a/b/c/AGENTS.md', 'a/b/AGENTS.md', 'a/AGENTS.md'])
  // The root AGENTS.md belongs to the MAIN chain, not the scoped one.
  assert.ok(!order.includes('AGENTS.md'))
})

test('a scoped MEMORY.md is loaded next to the scoped AGENTS.md', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-walk-')
  await mk(root, 'sub/f.ts', 'x')
  await mk(root, 'sub/AGENTS.md', 'sub rules')
  await mk(root, 'sub/MEMORY.md', 'sub memo')
  const ctx = await loadProjectContext(root, ['sub/f.ts'])
  assert.deepEqual(
    (ctx.scopedAgents ?? []).map((f) => rel(root, f.path)),
    ['sub/AGENTS.md', 'sub/MEMORY.md'],
  )
})

test('a path ABOVE the project never pulls anything', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-walk-')
  await mk(root, 'sub/f.ts', 'x')
  await mk(root, 'sub/AGENTS.md', 'sub rules')
  const ctx = await loadProjectContext(root, [
    '../outside/file.ts',
    '/etc/passwd',
    '..',
  ])
  assert.deepEqual(ctx.scopedAgents ?? [], [])
})

test('non-path words and an empty task pull nothing', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-walk-')
  await mk(root, 'sub/AGENTS.md', 'sub rules')
  const plain = await loadProjectContext(root, ['fix the bug please'])
  assert.deepEqual(plain.scopedAgents ?? [], [])
  const empty = await loadProjectContext(root, [])
  assert.deepEqual(empty.scopedAgents ?? [], [])
  // A directory token WITHOUT a separator is not a path either.
  const word = await loadProjectContext(root, ['sub'])
  assert.deepEqual(word.scopedAgents ?? [], [])
})

test('the project ROOT itself is not a scoped directory', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-walk-')
  await mk(root, 'AGENTS.md', 'root rules')
  await mk(root, 'f.ts', 'x')
  const ctx = await loadProjectContext(root, ['f.ts'])
  assert.deepEqual(ctx.scopedAgents ?? [], [])
  // ...and the root rules are still in the MAIN chain.
  assert.ok(ctx.agents.some((f) => f.content === 'root rules'))
})

test('a very long token is ignored instead of being resolved', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-walk-')
  await mk(root, 'sub/AGENTS.md', 'sub rules')
  const long = 'sub/' + 'x'.repeat(400) + '.ts'
  const ctx = await loadProjectContext(root, [long])
  assert.deepEqual(ctx.scopedAgents ?? [], [])
})
