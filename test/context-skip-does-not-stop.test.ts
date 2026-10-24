// loadProjectContext() budgets the AGENTS.md and MEMORY.md chains with
// takeWithin(), which used to BREAK at the first file that does not fit the
// pool. The chain runs global -> project root -> ... -> workdir, so one large
// file in the MIDDLE can fill the pool and every file after it is dropped —
// even a SMALL, MORE SPECIFIC one. The most specific instructions are exactly
// the ones lost. A file that does not fit must be SKIPPED, not end the chain.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadProjectContext } from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'
import fs from 'node:fs/promises'
import path from 'node:path'

test('a file that does not fit does not drop the ones after it', async (t) => {
  const root = await makeTmpDir(t, 'zames-ctx-skip-')
  const d1 = path.join(root, 'd1')
  const d2 = path.join(d1, 'd2')
  const d3 = path.join(d2, 'd3')
  await fs.mkdir(d3, { recursive: true })
  // Two big files fill the 240k pool (each clipped to ~120k), leaving ~134
  // chars. The NEXT level's AGENTS.md is 5000 chars and does not fit; the OLD
  // `break` ended the chain there, so the deeper TINY rule (the most specific
  // instructions) was never even looked at.
  await fs.writeFile(path.join(d1, 'AGENTS.md'), 'a'.repeat(200_000))
  await fs.writeFile(path.join(d2, 'AGENTS.md'), 'b'.repeat(200_000))
  await fs.writeFile(path.join(d3, 'AGENTS.md'), 'TOO BIG ' + 'z'.repeat(5_000))
  const d4 = path.join(d3, 'd4')
  await fs.mkdir(d4)
  await fs.writeFile(path.join(d4, 'AGENTS.md'), 'TINY RULE')
  const ctx = await loadProjectContext(d4)
  const texts = ctx.agents.map((f) => f.content)
  assert.ok(
    texts.some((c) => c.includes('TINY RULE')),
    'the most specific AGENTS.md was dropped: ' +
      JSON.stringify(ctx.agents.map((f) => f.content.length)),
  )
})

test('a normal chain is unchanged', async (t) => {
  const dir = await makeTmpDir(t, 'zames-ctx-ok-')
  await fs.writeFile(path.join(dir, 'AGENTS.md'), 'project rule')
  const ctx = await loadProjectContext(dir)
  assert.ok(ctx.agents.some((f) => f.content === 'project rule'))
})
