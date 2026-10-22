import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { createExtraTools } from '../src/extraTools.ts'
import type { ToolDef } from '../src/types.ts'
import { makeTmpDir } from './tmp-dir.ts'

// MultiEdit shares the Edit semantics: an edit WITHOUT `new_string` used to
// decode an empty replacement and silently DELETE the matched text (the same
// data-loss bug fixed in the single-file Edit). The whole multi-edit must be
// rejected and the file left untouched.
function tool(tools: ToolDef[], name: string): ToolDef {
  const t = tools.find((x) => x.name === name)
  if (!t) throw new Error('no tool ' + name)
  return t
}

test('MultiEdit with a missing new_string does not delete text', async (t) => {
  const dir = await makeTmpDir(t, 'zames-me-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'one two three')
  const tools = createExtraTools(dir)
  await assert.rejects(
    () =>
      Promise.resolve(
        tool(tools, 'MultiEdit').fn({
          path: 'a.txt',
          edits: [{ old_string: 'one' }],
        }),
      ),
    /new_string/i,
  )
  assert.equal(
    await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'),
    'one two three',
  )
})

test('MultiEdit with an explicit empty new_string still deletes', async (t) => {
  const dir = await makeTmpDir(t, 'zames-me-')
  await fs.writeFile(path.join(dir, 'a.txt'), 'one two three')
  const tools = createExtraTools(dir)
  await tool(tools, 'MultiEdit').fn({
    path: 'a.txt',
    edits: [{ old_string: 'one ', new_string: '' }],
  })
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf-8'), 'two three')
})
