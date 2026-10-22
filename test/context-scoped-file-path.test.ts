import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadProjectContext } from '../src/context.ts'
import { makeTmpDir } from './tmp-dir.ts'

// B6: nested AGENTS.md/MEMORY.md for the directories a task touches. The
// touched-path walker starts at the ABSOLUTE path of the token and climbs to
// the nearest EXISTING DIRECTORY — but it never checks that the resolved token
// is not a file. A task text like `sub/file.ts` (the normal way to name a file)
// therefore resolved to the file itself, which is not a directory, and the
// walker returned no directories at all: the scoped rules were silently
// dropped. A directory token (`sub/`) worked, which made the bug invisible.
test('a file path in the task text still pulls the scoped AGENTS.md', async (t) => {
  const base = await makeTmpDir(t, 'zames-ctx-')
  await fs.writeFile(path.join(base, 'AGENTS.md'), 'root rules')
  await fs.mkdir(path.join(base, 'sub'), { recursive: true })
  await fs.writeFile(path.join(base, 'sub', 'AGENTS.md'), 'sub rules')
  await fs.writeFile(path.join(base, 'sub', 'file.ts'), 'x')

  const ctx = await loadProjectContext(base, ['please fix sub/file.ts'])
  assert.deepEqual(
    (ctx.scopedAgents ?? []).map((f) => f.path),
    [path.join(base, 'sub', 'AGENTS.md')],
  )
})

test('a directory token still works', async (t) => {
  const base = await makeTmpDir(t, 'zames-ctx-')
  await fs.mkdir(path.join(base, 'sub'), { recursive: true })
  await fs.writeFile(path.join(base, 'sub', 'AGENTS.md'), 'sub rules')
  const ctx = await loadProjectContext(base, ['look at sub/'])
  assert.deepEqual(
    (ctx.scopedAgents ?? []).map((f) => f.path),
    [path.join(base, 'sub', 'AGENTS.md')],
  )
})
